"use strict"

const Ajv = require("ajv")

const ajv = Ajv()

function compileParams(params) {
  const body = params.filter(p => p.in === "body")[0]

  if (body) {
    return ajv.compile(body.schema)
  }

  const schema = {
    $async: true,
    required: [],
    properties: {}
  }

  for (const param of params) {
    schema.properties[param.name] = param

    if (param.required) {
      schema.required.push(param.name)
    }

    delete param.name
    delete param.required
  }

  if (schema.required.length === 0) {
    delete schema.required
  }

  return ajv.compile(schema)
}

module.exports = { compileParams }
