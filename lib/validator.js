"use strict";

const Ajv = require("ajv");
const debug = require("debug")("strut-router:validator");

const META_SCHEMA_ID = "http://json-schema.org/draft-04/schema";

const ajv = Ajv({ meta: false, coerceTypes: true });

// Monkey patch JSON Schema v4 draft for file support
const metaSchema = require("ajv/lib/refs/json-schema-draft-04.json");

metaSchema.definitions.simpleTypes.enum.push("file");

ajv.addMetaSchema(metaSchema, META_SCHEMA_ID, true);
ajv._refs["http://json-schema.org/schema"] = META_SCHEMA_ID;

function compile(params) {
  const schema = {
    $async: true,
    required: [],
    properties: {}
  };

  for (const p of params) {
    const param = Object.assign({}, p);

    schema.properties[param.name] = param;

    if (param.required) {
      schema.required.push(param.name);
    }

    delete param.name;
    delete param.required;
  }

  if (schema.required.length === 0) {
    delete schema.required;
  }

  return ajv.compile(schema);
}

function compileParams(params) {
  const body = params.filter(p => p.in === "body")[0];

  if (body) {
    return ajv.compile(body.schema);
  }

  return () => true;
}

function compilePath(params) {
  return compile(params.filter(p => p.in === "path"));
}

module.exports = { compileParams: compileParams, compilePath: compilePath };