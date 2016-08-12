"use strict"

const routington = require("routington")
const debug = require("debug")("strut-router")
const log = require("debug")("strut-router:log")
const _ = require("lodash")

const { convertPath, parseMethods } = require("./utils")
const { compileParams, compilePath } = require("./validator")

class InnerRouter {
  constructor(api, operations, models) {
    this.api = api
    this.router = routington()

    // Resolve operations
    for (const rawPath in api.paths) {
      const path = convertPath(rawPath)
      const route = this.router.define(path)[0]

      route.methods = parseMethods(api.paths[rawPath], operations)
      route.spec = api.paths[rawPath]
      route.bodyValidators = {}
      route.pathValidators = {}

      _.forEach(route.spec, (it, key) => {
        if (it.parameters) {
          route.bodyValidators[key] = compileParams(it.parameters)
          route.pathValidators[key] = compilePath(it.parameters)
        } else {
          route.bodyValidators[key] = () => true
          route.pathValidators[key] = () => true
        }
      })
    }

    this.models = models || {}
    this.secHandlers = {}
  }

  configure(match, ctx) {
    const spec = match.node.spec

    // Set the default data type
    if (spec.produces) {
      ctx.type = spec.produces[0]
    } else if (this.api.produces) {
      ctx.type = this.api.produces[0]
    }

    ctx.params = match.param
  }

  async getModels(match, ctx) {
    const spec = match.node.spec

    // Resolve models
    ctx.models = {}

    const method = ctx.method.toLowerCase()
    const params = spec[method].parameters

    if (!params) {
      return
    }

    for (const param of params) {
      const modelData = param["x-strut-model"]

      if (!modelData) {
        continue
      }

      const modelClass = this.models[modelData.type]

      let field

      if (param.in === "path") {
        field = match.param[param.name]
      } else if (param.in === "formData" || param.in === "body") {
        field = ctx.request.fields[param.name]
      }

      const model = await modelClass.findById(field)

      if (model == null) {
        ctx.throw(404)
      }

      ctx.models[modelData.name] = model
    }
  }

  async coerce(match, ctx) {
    debug("Coerce")
    const spec = match.node.spec

    const method = ctx.method.toLowerCase()
    const params = spec[method].parameters

    if (!ctx.request.fields) {
      ctx.request.fields = {}
    }

    if (!params) {
      return
    }

    for (const param of params) {
      let v = ctx.request.fields[param.name]

      if (v == null) {
        continue
      }

      switch (param.type) {
        case "string":
          switch (param.format) {
            case "date":
            case "date-time":
              v = new Date(v)
              break
            case "json":
              v = JSON.parse(v)
              if (param["x-strut-schema"]) {
                Object.assign(ctx.request.fields, v)
                continue
              }
          }
      }

      ctx.request.fields[param.name] = v
    }
  }

  async authenticate(match, ctx) {
    try {
      const spec = match.node.spec
      const security = spec[ctx.method.toLowerCase()].security || this.api.security || []

      debug("Security", security)

      for (const sec of security) {
        const name = Object.keys(sec)[0]
        const def = this.api.securityDefinitions[name]

        switch (def.type) {
          case "apiKey": {
            if (def.in === "header") {
              return await this.secHandlers[def.name](ctx, ctx.header[def.name.toLowerCase()])
            } else {
              return await this.secHandlers[def.name](ctx, ctx.query[def.name])
            }
          }
          default:
            ctx.throw(400, `unsupported securityDefinition type: ${def.type}`)
            return false
        }
      }

      return true
    } catch (err) {
      debug(err)
      ctx.throw(err)
    }
  }

  middleware() {
    const r = this.router

    return async (ctx, next) => {
      const match = r.match(ctx.path)

      if (!match || !match.node.methods) {
        return await next()
      }

      const controller = match.node.methods[ctx.method]

      if (!controller) {
        return ctx.throw(405)
      }

      // Test if we can even access endpoint
      if (!(await this.authenticate(match, ctx))) {
        debug("Auth failed")
        return ctx.throw(401)
      }

      debug("Running validator")

      // Validate input for legitimacy
      const validator = match.node.bodyValidators[ctx.method.toLowerCase()]

      try {
        await validator(ctx.request.fields)
      } catch (err) {
        debug(err.errors)
        return ctx.throw(400)
      }

      if (validator.errors) {
        debug(validator.errors)
        return ctx.throw(400)
      }

      // Fun configuration times
      this.configure(match, ctx)

      // Assign models to ctx.models
      await this.getModels(match, ctx)

      // Coerce data
      await this.coerce(match, ctx)

      // Run the controller
      debug("Running controller")
      debug(controller)
      await controller(ctx)

      log("ctx.body", ctx.body)
    }
  }
}

module.exports = InnerRouter
