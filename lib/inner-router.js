"use strict";

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const routington = require("routington");
const debug = require("debug")("strut-router");
const log = require("debug")("strut-router:log");
const _ = require("lodash");

var _require = require("./utils");

const convertPath = _require.convertPath,
      parseMethods = _require.parseMethods;

var _require2 = require("./validator");

const compileParams = _require2.compileParams,
      compilePath = _require2.compilePath;


const AUTH_FAILED = "AUTH_FAILED";
const NO_PERMISSION = "NO_PERMISSION";

function makeError(code) {
  return { strut: true, code: code };
}

class InnerRouter {
  constructor(api, operations, models) {
    this.api = api;
    this.router = routington();

    // Resolve operations
    for (const rawPath in api.paths) {
      const path = convertPath(rawPath);
      const route = this.router.define(path)[0];

      route.methods = parseMethods(api.paths[rawPath], operations);
      route.spec = api.paths[rawPath];
      route.bodyValidators = {};
      route.pathValidators = {};

      _.forEach(route.spec, (it, key) => {
        if (it.parameters) {
          route.bodyValidators[key] = compileParams(it.parameters);
          route.pathValidators[key] = compilePath(it.parameters);
        } else {
          route.bodyValidators[key] = () => true;
          route.pathValidators[key] = () => true;
        }
      });
    }

    this.models = models || {};
    this.secHandlers = {};
  }

  configure(match, ctx) {
    const spec = match.node.spec;

    // Set the default data type
    if (spec.produces) {
      ctx.type = spec.produces[0];
    } else if (this.api.produces) {
      ctx.type = this.api.produces[0];
    }

    ctx.params = match.param;
  }

  getModels(match, ctx) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const spec = match.node.spec;

      // Resolve models
      ctx.models = {};

      const method = ctx.method.toLowerCase();
      const params = spec[method].parameters;

      if (!params) {
        return;
      }

      for (const param of params) {
        const modelData = param["x-strut-model"];

        if (!modelData) {
          continue;
        }

        const modelClass = _this.models[modelData.type];

        let field;

        if (param.in === "path") {
          field = match.param[param.name];
        } else if (param.in === "formData" || param.in === "body") {
          field = ctx.request.fields[param.name];
        }

        const model = yield modelClass.findById(field);

        if (model == null) {
          ctx.throw(404);
        }

        ctx.models[modelData.name] = model;
      }
    })();
  }

  coerce(match, ctx) {
    return _asyncToGenerator(function* () {
      const spec = match.node.spec;

      const method = ctx.method.toLowerCase();
      const params = spec[method].parameters;

      if (!ctx.request.fields) {
        ctx.request.fields = {};
      }

      if (!params) {
        return;
      }

      for (const param of params) {
        let v = ctx.request.fields[param.name];

        if (v == null) {
          continue;
        }

        switch (param.type) {
          case "string":
            switch (param.format) {
              case "date":
              case "date-time":
                v = new Date(v);
                break;
              case "json":
                v = JSON.parse(v);
                if (param["x-strut-schema"]) {
                  Object.assign(ctx.request.fields, v);
                  continue;
                }
            }
        }

        ctx.request.fields[param.name] = v;
      }
    })();
  }

  authenticate(match, ctx) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      try {
        const spec = match.node.spec;
        const security = spec[ctx.method.toLowerCase()].security || _this2.api.security || [];

        debug("Security", security);

        for (const sec of security) {
          const name = Object.keys(sec)[0];
          const def = _this2.api.securityDefinitions[name];
          let res;

          switch (def.type) {
            case "apiKey":
              {
                if (def.in === "header") {
                  res = yield _this2.secHandlers[def.name](ctx, ctx.header[def.name.toLowerCase()]);
                } else {
                  res = yield _this2.secHandlers[def.name](ctx, ctx.query[def.name]);
                }
                break;
              }
            default:
              ctx.throw(500, `unsupported securityDefinition type: ${def.type}`);
              return false;
          }

          if (!res) {
            return makeError(AUTH_FAILED);
          }
        }

        if (_this2.rbac) {
          var _ref = spec[ctx.method.toLowerCase()]["x-strut-rbac"] || _this2.api["x-strut-rbac"];

          const permissions = _ref.permissions;


          if (!permissions) {
            return true;
          }

          const res = yield _this2.rbac.check(ctx, permissions);

          debug("rbac result", res);

          if (!res) {
            return makeError(NO_PERMISSION);
          }
        }

        return true;
      } catch (err) {
        debug(err);
        ctx.throw(err);
      }
    })();
  }

  middleware() {
    var _this3 = this;

    const r = this.router;

    return (() => {
      var _ref2 = _asyncToGenerator(function* (ctx, next) {
        const match = r.match(ctx.path);

        if (!match || !match.node.methods) {
          return yield next();
        }

        const controller = match.node.methods[ctx.method];

        if (!controller) {
          return ctx.throw(405);
        }

        // Test if we can even access endpoint
        const res = yield _this3.authenticate(match, ctx);

        if (res !== true) {
          debug("Auth failed");
          return ctx.throw(401, res);
        }

        // Validate input for legitimacy
        const validator = match.node.bodyValidators[ctx.method.toLowerCase()];

        try {
          yield validator(ctx.request.fields);
        } catch (err) {
          // Errors caught in next block
        }

        if (validator.errors) {
          debug(validator.errors);
          ctx.status = 400;

          if (process.env.NODE_ENV !== "production") {
            ctx.body = validator.errors;
          }

          return;
        }

        // Fun configuration times
        _this3.configure(match, ctx);

        // Assign models to ctx.models
        yield _this3.getModels(match, ctx);

        // Coerce data
        yield _this3.coerce(match, ctx);

        // Run the controller
        debug(controller);
        yield controller(ctx);

        if (ctx.body == null) {
          ctx.status = 204;
        }

        log("ctx.body", ctx.body);
      });

      return function (_x, _x2) {
        return _ref2.apply(this, arguments);
      };
    })();
  }
}

module.exports = InnerRouter;