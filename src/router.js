"use strict"

const SwaggerParser = require("swagger-parser")
const RBAC = require("rbac-a")
const debug = require("debug")("strut-router")

const InnerRouter = require("./inner-router")

class Router {
  constructor(app, schemaPath, operations, models) {
    this.app = app
    this.schema = schemaPath
    this.operations = operations || {}
    this.models = models || {}
    this.secHandlers = {}
  }

  add(operations) {
    for (const c in operations) {
      this.operations[c] = operations[c]
    }
  }

  setSecurityHandler(name, handler) {
    this.secHandlers[name] = handler
  }

  setRbacProvider(provider) {
    this.rbacProvider = provider
  }

  async api() {
    if (!this._api) {
      try {
        this._api = await SwaggerParser.validate(this.schema)
      } catch (err) {
        this.app.emit("error", err)
        throw err
      }

      await this.verify()
    }

    return this._api
  }

  async verify() {
    const api = await this.api()
    let hasFailure = false

    for (const rawPath in api.paths) {
      for (const method in api.paths[rawPath]) {
        const operationId = api.paths[rawPath][method].operationId

        if (!operationId) {
          console.error(`- No operationId found for ${method.toUpperCase()} ${rawPath}`)
          hasFailure = true
        }

        if (!this.operations[operationId]) {
          console.error(`- No controller found for operation ${operationId}`)
          hasFailure = true
        }
      }
    }

    if (hasFailure) {
      const err = new Error("Failed verification.")

      this.app.emit("error", err)
      throw err
    }
  }

  middleware() {
    let m

    return async (ctx, next) => {
      if (!m) {
        try {
          const api = await this.api()
          const router = new InnerRouter(api, this.operations, this.models)

          router.secHandlers = this.secHandlers
          router.rbac = new RBAC({
            provider: new (this.rbacProvider)({ api })
          })

          m = router.middleware()
        } catch (err) {
          ctx.throw(500, err)
        }
      }

      return await m(ctx, next)
    }
  }
}

module.exports = Router
