"use strict"

const RBAC = require("rbac-a")

class StrutRbacProvider extends RBAC.Provider {
  constructor({ api }) {
    super()
    this.api = api
    this.roles = this.api["x-strut-rbac-roles"]
  }

  getPermissions(role) {
    if (!this.roles) {
      return []
    }

    return this.roles[role].permissions || []
  }

  getAttributes(role) {
    if (!this.roles) {
      return []
    }

    return this.roles[role].attributes || []
  }
}

module.exports = { StrutRbacProvider }
