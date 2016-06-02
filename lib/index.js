"use strict"
require("babel-register")({
  presets: ["es2015", "stage-0"]
})

module.exports = require("./router")
