"use strict";

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const SwaggerParser = require("swagger-parser");
const RBAC = require("rbac-a");
const debug = require("debug")("strut-router");

const InnerRouter = require("./inner-router");

class Router {
  constructor(app, schemaPath, operations, options) {
    this.app = app;
    this.schema = schemaPath;
    this.operations = operations || {};
    this.models = options.models || {};
    this.secHandlers = options.security || {};
    this.rbacProvider = options.rbac;
  }

  addOperations(operations) {
    for (const c in operations) {
      this.operations[c] = operations[c];
    }
  }

  /*
  setSecurityHandler(name, handler) {
    this.secHandlers[name] = handler
  }
   setRbacProvider(provider) {
    this.rbacProvider = provider
  }
  */

  api() {
    var _this = this;

    return _asyncToGenerator(function* () {
      if (!_this._api) {
        try {
          _this._api = yield SwaggerParser.validate(_this.schema);
        } catch (err) {
          _this.app.emit("error", err);
          throw err;
        }

        yield _this.verify();
      }

      return _this._api;
    })();
  }

  verify() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      const api = yield _this2.api();
      let hasFailure = false;

      for (const rawPath in api.paths) {
        for (const method in api.paths[rawPath]) {
          if (method.startsWith("x-") || method === "parameters") {
            continue;
          }

          const operationId = api.paths[rawPath][method].operationId;

          if (!operationId) {
            console.error(`- No operationId found for ${method.toUpperCase()} ${rawPath}`);
            hasFailure = true;
            continue;
          }

          if (!_this2.operations[operationId]) {
            console.error(`- No controller found for operation ${operationId}`);
            hasFailure = true;
          }
        }
      }

      if (hasFailure) {
        const err = new Error("Failed verification.");

        _this2.app.emit("error", err);
        throw err;
      }
    })();
  }

  middleware() {
    var _this3 = this;

    let m;

    return (() => {
      var _ref = _asyncToGenerator(function* (ctx, next) {
        if (!m) {
          yield _this3.verify();

          try {
            const api = yield _this3.api();
            const router = new InnerRouter(api, _this3.operations, _this3.models);

            router.secHandlers = _this3.secHandlers;

            if (_this3.rbacProvider) {
              router.rbac = new RBAC({
                provider: new _this3.rbacProvider({ api: api })
              });
            }

            m = router.middleware();
          } catch (err) {
            ctx.throw(500, err);
          }
        }

        return yield m(ctx, next);
      });

      return function (_x, _x2) {
        return _ref.apply(this, arguments);
      };
    })();
  }
}

module.exports = Router;