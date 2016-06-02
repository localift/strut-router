"use strict"

const routington = require("routington")
const debug = require("debug")("strut-router")
const _ = require("lodash")

const { convertPath, parseMethods } = require("./utils")
const { compileParams } = require("./validator")

class InnerRouter {
  constructor(api, controllers, models) {
    this.api = api
    this.router = routington()

    // Resolve operations
    for (const rawPath in api.paths) {
      const path = convertPath(rawPath)
      const route = this.router.define(path)[0]

      route.methods = parseMethods(api.paths[rawPath], controllers)
      route.spec = api.paths[rawPath]
      route.validators = {}

      _.forEach(route.spec, (it, key) => {
        if (it.parameters) {
          route.validators[key] = compileParams(it.parameters)
        } else {
          route.validators[key] = () => true
        }
      })
    }

    this.models = models || {}
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

      let query

      if (param.in === "path") {
        query = match.param[param.name]
      } else if (param.in === "formData" || param.in === "body") {
        query = ctx.request.fields[param.name]
      }

      const model = await modelClass.findById(query)

      if (model == null) {
        ctx.throw(404)
      }

      ctx.models[modelData.name] = model
    }
  }

  middleware() {
    const r = this.router

    return async (ctx, next) => {
      const match = r.match(ctx.path)

      if (!match) {
        return await next()
      }

      if (!match.node.methods) {
        return await next()
      }

      debug("Got match", match)
      const controller = match.node.methods[ctx.method]

      if (!controller) {
        ctx.throw(405)
      }

      const validator = match.node.validators[ctx.method.toLowerCase()]

      try {
        await validator(ctx.request.fields)
      } catch (err) {
        // The errors end up in validator either way.
      }

      if (validator.errors) {
        debug(validator.errors)
        return ctx.throw(400)
      }

      this.configure(match, ctx)
      await this.getModels(match, ctx)

      await controller(ctx)
    }
  }
}

module.exports = InnerRouter
