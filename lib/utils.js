"use strict";

function convertPath(apiPath) {
  return apiPath.replace(/}/g, "").replace(/{/g, ":");
}

function parseMethods(methods, operations) {
  const o = {};

  for (const method in methods) {
    if (method.startsWith("x-") || method === "parameters") {
      continue;
    }

    const values = methods[method];
    const controller = operations[values.operationId];

    if (!controller) {
      throw new TypeError(`No controller for operation "${values.operationId}"`);
    }

    o[method.toUpperCase()] = controller;
  }

  return o;
}

module.exports = {
  convertPath: convertPath,
  parseMethods: parseMethods
};