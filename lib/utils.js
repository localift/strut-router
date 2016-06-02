"use strict"

function convertPath(apiPath) {
  return apiPath.replace(/}/g, "").replace(/{/g, ":")
}

function parseMethods(methods, controllers) {
  const o = {}

  for (const method in methods) {
    const values = methods[method]
    const controller = controllers[values.operationId]

    if (!controller) {
      throw new TypeError(`No controller for operation "${values.operationId}"`)
    }

    o[method.toUpperCase()] = controller
  }

  return o
}

module.exports = {
  convertPath,
  parseMethods
}
