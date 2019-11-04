const _ = require("lodash");
const asyncjs = require("async");
const errors = require("@turbot/errors");
const utils = require("@turbot/utils");
const uuidv4 = require("uuid/v4");

class Turbot {
  // TODO
  // Logging level in opts - don't log if lower than that.
  // initialize
  // finalize
  // send results to S3 / SNS / ?
  // database connection & query
  // get install / env / tenant & function from event
  // parameter loading
  // Log basics about the function start / stop / tenant / etc
  // Use memory cache with configurable cache expiration
  // data key and decryption / aws credentials

  constructor(meta = {}, opts = {}) {
    this.meta = meta;

    this.process = null;
    this.opts = opts;

    this.resourcesToBeDeleted = [];
    this.sensitiveExceptions = [];

    // Setting this 1 second makes it losing messages
    _.defaults(this.opts, { type: "control", delay: 2000 });

    // Prefer the log level in opts rather than environment variable
    this.logLevel = opts.logLevel || process.env.TURBOT_LOG_LEVEL;
    if (!this.logLevel) {
      this.logLevel = "warning";
    }

    this.cargoContainer = new CargoContainer(meta, opts);

    if (this.meta.live && !this.opts.inline) {
      this.cargoContainer.streamData();
    }
  }

  stop() {
    this.cargoContainer.stop();
  }

  /**
   * Finalize function.
   *
   * @param {function} callback
   */
  finalize(callback) {
    return (err, results) => {
      if (err) {
        this.error("Error in function for workspace " + this.tenantId, err);
      }
      callback(err, results);
    };
  }

  //
  // Environment
  //
  // TODO: 13/08 should we split this functionality?
  //
  get tenantId() {
    return this._tenantId;
  }

  set tenantId(id) {
    this._tenantId = id;
  }

  get trace() {
    return this._trace;
  }

  set largeCommandMode(largeCommandMode) {
    if (this.opts.inline) {
      throw new errors.badRequest("Large command is not valid in inline mode");
    }
    this.cargoContainer.largeCommandMode = largeCommandMode;
  }

  get largeCommandMode() {
    return this.cargoContainer.largeCommandMode;
  }

  //
  // PROCESS
  //

  _process(state) {
    if (this.process) {
      this.log.debug(`Process state previously set to: ${this.process.state}. Resetting.`, this.process);
    }
    this.process = { state, timestamp: new Date() };
    this.log.debug(`Setting process state: ${this.process.state}.`, this.process);
  }

  update() {
    this.cargoContainer.phase = "update";
    this._process("update");
  }

  terminate() {
    this.cargoContainer.phase = "terminate";
    this._process("terminate");
  }

  //
  // COMMAND
  //

  _command(data) {
    if (!data.meta) {
      data.meta = {};
    }
    if (!data.meta.timestamp) {
      data.meta.timestamp = new Date().toISOString();
    }

    let aka =
      _.get(data, "meta.aka") ||
      _.get(data, "meta.resourceId") ||
      _.get(data, "payload.meta.aka") ||
      _.get(data, "payload.meta.resourceId") ||
      _.get(data, "payload.turbotData.akas[0]");

    if (data.type && data.type.endsWith("_update")) {
      // Control/action/policy update operation does not set the resourceId in the meta
      // because it's implied from the control/action/policy itself
      if (!aka && this.meta.resourceId) {
        aka = this.meta.resourceId;
      }
    }
    if (aka && this.resourcesToBeDeleted.includes(aka)) {
      throw new errors.badRequest(`Unable to run ${aka}. Resource is already in the delete list.`);
    }

    this.cargoContainer.command(data);
    return data;
  }

  //
  // LOGGING
  //

  _logger(level, message, data) {
    // If we only pass 2 parameters and the the message is passed as the error object for example
    // message will be "" and we get the object within the 'data' field
    if (!data && !_.isString(message)) {
      data = message;
      message = null;
    }

    if (!_.isPlainObject(data)) {
      data = { data: data };
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message || ""
    };

    // use explicit undefined check rather than truthiness check as we want to allow zero/false values through
    entry.data = typeof data === "undefined" ? {} : data;

    let loggingOptions = {
      breakCircular: true,
      exceptions: this.sensitiveExceptions
    };
    loggingOptions = _.omitBy(loggingOptions, _.isNil);
    const logEntry = utils.data.sanitize(entry, loggingOptions);

    this.cargoContainer.log(logEntry);
    return this;
  }

  get log() {
    const self = this;
    return {
      // NOTE: Turbot log levels (e.g. emergency, etc) are not available to controls.
      error: function(message, data) {
        return self._logger("error", message, data);
      },

      warning: function(message, data) {
        return self._logger("warning", message, data);
      },

      notice: function(message, data) {
        return self._logger("notice", message, data);
      },

      info: function(message, data) {
        return self._logger("info", message, data);
      },

      debug: function(message, data) {
        return self._logger("debug", message, data);
      }
    };
  }

  //
  // STATE MANAGEMENT FOR CONTROLS
  //

  _state(state, runnableId, reason, data) {
    const meta = {};
    if (!runnableId) {
      switch (this.opts.type) {
        case "action":
          runnableId = this.meta.actionId;
          break;
        case "scheduledAction":
          runnableId = this.meta.scheduledActionId;
          break;
        case "policy":
          runnableId = this.meta.policyValueId;
          break;
        case "report":
          runnableId = this.meta.reportId;
          break;
        case "control":
        default:
          runnableId = this.meta.controlId;
      }
    }

    let newState = { state, timestamp: new Date() };

    // If the execution type is policy then we have a slightly different logic
    // in policy we are more interested with the data, so allow user to
    // pass turbot.ok({ policy: valueHere });
    //
    // For controls we want to be able to say:
    // turbot.ok('reason here');
    //
    if (this.opts.type === "policy" && (data === null || data === undefined)) {
      data = reason;
      reason = null;
    }
    // Support the case where they pass in an object for data, but no reason.
    else if (!data && typeof reason != "string") {
      data = reason;
      reason = null;
    }

    if (reason) {
      newState.reason = reason;
    } else {
      // This looks rather odd, but don't remove it. This issue is illustrated in
      // turbot-core/events/test/events.js
      // Different error has different output behaviour with VM2.
      if (data && data.stack && data.message && typeof data.stack === "string") {
        reason = data.name + ": " + data.message;
        newState.reason = reason;
      }
    }

    this.log.info(`Update ${this.opts.type} state: ${newState.state}.`, newState);

    switch (this.opts.type) {
      case "action":
      case "scheduledAction":
      case "report":
      case "control":
        meta[`${this.opts.type}Id`] = runnableId;
        if (data) {
          if (data.details) {
            newState.details = data.details;
            delete data.details;
          }
          if (data.reason && _.isEmpty(newState.reason)) {
            newState.reason = data.reason;
            delete data.reason;
          }
          newState.data = data;
        }
        break;
      case "policy":
        meta.policyValueId = runnableId;
        if (data || data === "" || data === false) {
          newState.value = data;
        }
        break;
      default:
        meta[`${this.opts.type}Id`] = runnableId;
    }

    this._command({
      type: `${this.opts.type}_update`,
      meta: meta,
      payload: newState
    });
    return this;
  }

  _stateStager(state, arg1, arg2, arg3) {
    let controlId, reason, data;
    if (/^\d{15}$/.test(arg1)) {
      controlId = arg1;
      if (typeof arg2 == "string") {
        reason = arg2;
        data = arg3;
      } else {
        data = arg2;
      }
    } else if (typeof arg1 == "string") {
      reason = arg1;
      data = arg2;
    } else {
      data = arg1;
    }
    return this._state(state, controlId, reason, data);
  }

  _stateGQL(state, runnableId, reason, data) {
    const meta = {};
    if (!runnableId) {
      switch (this.opts.type) {
        case "action":
          runnableId = this.meta.actionId;
          break;
        case "scheduledAction":
          runnableId = this.meta.scheduledActionId;
          break;
        case "policy":
          runnableId = this.meta.policyValueId;
          break;
        case "report":
          runnableId = this.meta.reportId;
          break;
        case "control":
        default:
          runnableId = this.meta.controlId;
      }
    }

    let newState = { state, timestamp: new Date() };

    // If the execution type is policy then we have a slightly different logic
    // in policy we are more interested with the data, so allow user to
    // pass turbot.ok({ policy: valueHere });
    //
    // For controls we want to be able to say:
    // turbot.ok('reason here');
    //
    if (this.opts.type === "policy" && !data) {
      data = reason;
      reason = null;
    }
    // Support the case where they pass in an object for data, but no reason.
    else if (!data && typeof reason != "string") {
      data = reason;
      reason = null;
    }

    if (reason) {
      newState.reason = reason;
    } else {
      // This looks rather odd, but don't remove it. This issue is illustrated in
      // turbot-core/events/test/events.js
      // Different error has different output behaviour with VM2.
      if (data && data.stack && data.message && typeof data.stack === "string") {
        reason = data.name + ": " + data.message;
        newState.reason = reason;
      }
    }

    this.log.info(`Update ${this.opts.type} state: ${newState.state}.`, newState);

    let query;
    let variables;

    switch (this.opts.type) {
      case "action":
      case "scheduledAction":
      case "report":
      case "control":
        meta[`${this.opts.type}Id`] = runnableId;
        if (data) {
          if (data.details) {
            newState.details = data.details;
            delete data.details;
          }
          if (data.reason && _.isEmpty(newState.reason)) {
            newState.reason = data.reason;
            delete data.reason;
          }
          newState.data = data;
        }
        break;
      case "policy":
        query = `mutation UpdatePolicyValue($input: UpdatePolicyValueInput!) {
            updatePolicyValue(input: $input) {
              turbot {
                id
              }
            }
          }`;

        variables = {
          input: {
            id: runnableId,
            value: data
          }
        };

        break;
      default:
        meta[`${this.opts.type}Id`] = runnableId;
    }

    const command = {
      type: "graphql",
      query,
      variables
    };

    this._command(command);
    return this;
  }

  _stateStagerGQL(state, arg1, arg2, arg3) {
    let controlId, reason, data;
    if (/^\d{15}$/.test(arg1)) {
      controlId = arg1;
      if (typeof arg2 == "string") {
        reason = arg2;
        data = arg3;
      } else {
        data = arg2;
      }
    } else if (typeof arg1 == "string") {
      reason = arg1;
      data = arg2;
    } else {
      data = arg1;
    }
    return this._stateGQL(state, controlId, reason, data);
  }

  ok(controlId, reason, data) {
    this.terminate();
    // if (this.opts.type === "policy") {
    //   return this._stateStagerGQL("ok", controlId, reason, data);
    // }
    return this._stateStager("ok", controlId, reason, data);
  }

  alarm(controlId, reason, data) {
    this.terminate();
    return this._stateStager("alarm", controlId, reason, data);
  }

  skipped(controlId, reason, data) {
    this.terminate();
    return this._stateStager("skipped", controlId, reason, data);
  }

  error(controlId, reason, data) {
    this.terminate();
    return this._stateStager("error", controlId, reason, data);
  }

  insufficient_data(controlId, reason, data) {
    return this._stateStager("insufficient_data", controlId, reason, data);
  }

  invalid(controlId, reason, data) {
    this.terminate();
    return this._stateStager("invalid", controlId, reason, data);
  }

  tbd(controlId, reason, data) {
    this.terminate();
    return this._stateStager("tbd", controlId, reason, data);
  }

  setGraphqlVariablesActors(input, turbotData) {
    if (!input.actor) {
      input.actor = {};
    }

    // This is for backward compatibility with the mods
    input.actor = _.defaults(input.actor, {
      identityId: _.get(turbotData, "identityId", _.get(turbotData, "actorIdentityId")),
      personaId: _.get(turbotData, "personaId", _.get(turbotData, "actorPersonaId")),
      roleId: _.get(turbotData, "roleId", _.get(turbotData, "actorRoleId")),
      alternatePersona: _.get(turbotData, "alternatePersona")
    });

    if (!input.actor.identityId && !input.actor.personaId && !input.actor.roleId && !input.actor.alternatePersona) {
      input.actor = _.defaults(input.actor, {
        identityId: this.meta.identityId || this.meta.actorIdentityId,
        personaId: this.meta.personaId || this.meta.actorPersonaId,
        roleId: this.meta.roleId || this.meta.actorRoleId,
        alternatePersona: this.meta.alternatePersona
      });
    }

    input.actor = _.omitBy(input.actor, _.isNil);
    return input;
  }

  setCommandMeta(meta, turbotData) {
    // Prefer the setup in TurbotData
    meta = _.defaults(meta, {
      actorIdentityId: _.get(turbotData, "actorIdentityId"),
      actorPersonaId: _.get(turbotData, "actorPersonaId"),
      actorRoleId: _.get(turbotData, "actorRoleId"),
      alternatePersona: _.get(turbotData, "alternatePersona")
    });

    // Don't chain two defaults here, because we may mix turbotData and the one from the event's meta.

    if (!meta.actorIdentityId && !meta.actorPersonaId && !meta.actorRoleId && !meta.alternatePersona) {
      meta = _.defaults(meta, {
        actorIdentityId: this.meta.actorIdentityId,
        actorPersonaId: this.meta.actorPersonaId,
        actorRoleId: this.meta.actorRoleId,
        alternatePersona: this.meta.alternatePersona
      });
    }

    meta = _.omitBy(meta, _.isNil);
    return meta;
  }

  //
  // Is action just a command? run_action for example?
  // or is it more of a control but potentially in a different shape
  //
  // What is we're running an action as part of a control? Should that be just
  // a command?
  //
  // On the same vein, should we able to run a control by issuing a run_control command?
  //

  get action() {
    const self = this;
    return {
      run: function(aka, actionUri, parameters) {
        // aka parameter is optional
        if (!parameters) {
          parameters = actionUri;
          actionUri = aka;
          aka = null;
        }

        if (!aka) {
          aka = self.meta.resourceId;
        }

        // TODO: the actionUri should be in the payload not meta. See how the control.run is done
        const meta = { controlId: self.meta.controlId, actionUri: actionUri };
        if (self.meta.pid) {
          meta.parentProcessId = self.meta.pid;
        }
        self._command({
          type: "action_run",
          meta: meta,
          payload: {
            meta: {
              aka: aka,
              actionUri: actionUri
            },
            data: parameters
          }
        });
      }
    };
  }

  get control() {
    const self = this;
    return {
      /**
       * aka parameter is optional
       * example:
       *
       * turbot.control.run('my-aka', '#/control/types/cmdb', { foo: 'bar' })
       */
      run: function(aka, controlUri, parameters) {
        // aka parameter is optional
        if (!parameters) {
          parameters = controlUri;
          controlUri = aka;
          aka = null;
        }

        if (!aka) {
          aka = self.meta.resourceId;
        }

        const payload = {
          meta: {
            controlUri: controlUri,
            aka: aka
          },
          data: parameters
        };

        let commandMeta = { controlId: self.meta.controlId, actionId: self.meta.actionId };
        if (self.meta.pid) {
          commandMeta.parentProcessId = self.meta.pid;
        }

        commandMeta = self.setCommandMeta(commandMeta, {});

        self._command({
          type: "control_run",
          meta: commandMeta,
          payload: payload
        });
      },

      nextRun: function(data) {
        self.cargoContainer.nextRun = data;
      },

      // the turbot.control.ok mirrors the turbot.(ok/tbd/invalid/error). We would like
      // mod developers to always put a reason in a control set change, unlike setting policy
      // turbot.policy.ok(<policy value>). Majority of the case we don't set a reason for setting
      // policy value
      ok: function(reason, data) {
        return self._stateStager("ok", reason, data);
      },

      tbd: function(reason, data) {
        return self._stateStager("tbd", reason, data);
      },

      invalid: function(reason, data) {
        return self._stateStager("invalid", reason, data);
      },

      error: function(reason, data) {
        return self._stateStager("error", reason, data);
      }
    };
  }

  //
  // NOTIFICATIONS
  //

  notify(controlId, icon, message, data) {
    if (!/\d+/.test(controlId)) {
      data = message;
      message = icon;
      icon = controlId;
      controlId = this.meta.controlId;
    }

    const command = {
      type: `${this.opts.type}_notify`,
      meta: {
        // This is the meta for the command itself
      },
      payload: {
        data: {
          icon,
          message
        },
        meta: {
          // This is the meta of the data that is being saved
        }
      }
    };

    // For this command the meta of the command and the meta of the data
    // is the same, but may not always be the case
    switch (this.opts.type) {
      case "action": {
        command.meta.actionId = this.meta.actionId;
        command.payload.meta.actionId = this.meta.actionId;
        break;
      }
      case "scheduledAction": {
        command.meta.scheduledActionId = this.meta.scheduledActionId;
        command.payload.meta.scheduledActionId = this.meta.scheduledActionId;
        break;
      }
      case "policy": {
        command.meta.policyValueId = this.meta.policyValueId;
        command.payload.meta.policyValueId = this.meta.policyValueId;
        break;
      }
      case "control":
      default: {
        command.meta.controlId = controlId;
        command.payload.meta.controlId = controlId;
      }
    }

    if (data) {
      command.payload.data.data = data;
    }

    this._command(command);
    return this;
  }

  //
  // RESOURCES
  //

  _resource(type, resourceId, data, turbotData) {
    let id = null;

    if (/^\d{15}$/.test(resourceId)) {
      // If resourceId is 15 digit number then it's the resource id
      id = resourceId;
    } else if (_.isPlainObject(resourceId)) {
      // if the resource id is a plain object, that's the data
      // and id is the meta.resourceId
      turbotData = data;
      data = resourceId;
      id = this.meta.resourceId;
    } else if (_.isString(resourceId)) {
      id = null;
      if (!turbotData) {
        turbotData = {};
      }
      _.defaults(turbotData, { akas: [resourceId] });
    }

    const command = {
      type: "resource_" + type,
      meta: {
        resourceId: id
      },
      payload: {
        data: data,
        turbotData: turbotData
      }
    };

    command.meta = this.setCommandMeta(command.meta, turbotData);
    command.payload = _.omitBy(command.payload, _.isNil);

    let msg = type.slice(0, 1).toUpperCase() + type.slice(1) + " resource: " + command.meta.resourceId + ".";
    this.log.info(msg, { data, turbotData });
    this._command(command);
    return this;
  }

  get resource() {
    var self = this;
    return {
      createGQL: function(parentId, resourceTypeAka, data, turbotData) {
        if (!turbotData && !data && !resourceTypeAka) {
          throw new errors.badRequest("Resource Type AKA and Data are mandatory");
        }

        // If there are only two parameters, assume that it is something like this:
        // ('#/resource/types/foo', { body: 'is here' });
        // because these two fields are mandatory
        if (!turbotData && !data) {
          data = resourceTypeAka;
          resourceTypeAka = parentId;

          // Default parent id as the current executing control resource
          parentId = self.meta.resourceId;
          turbotData = null;
        } else if (!turbotData) {
          // Here we have three parameters so we have to do some guesswork what is the
          // intention of the mod developer
          if (_.isString(parentId)) {
            // ('#/resource/types/foo', { body: 'is here' }, { akas: [] });
            turbotData = data;
            data = resourceTypeAka;
            resourceTypeAka = parentId;
            parentId = self.meta.resourceId;
          } else {
            // (null, '#/resource/types/foo', { body: 'is here' });
            turbotData = null;
          }
        }

        const query = `mutation CreateResource($input: RunnableCreateResourceInput!) {
          createResource(input: $input) {
            turbot {
              id
            }
          }
        }`;

        const variables = {
          input: {
            parent: parentId,
            type: resourceTypeAka,
            data: data
          }
        };

        _.merge(variables.input, turbotData);
        if (!variables.input.metadata) {
          variables.input.metadata = _.get(turbotData, "custom");
        }

        delete variables.input.custom;

        variables.input = self.setGraphqlVariablesActors(variables.input, turbotData);

        const command = {
          type: "graphql",
          query,
          variables
        };

        const msg = `Create resource ${command.variables.input.type} with parent: ${command.variables.input.parentId}.`;
        self.log.info(msg, { data, turbotData });

        self._command(command);
        return self;
      },

      create: function(parentId, resourceTypeAka, data, turbotData) {
        if (!turbotData && !data && !resourceTypeAka) {
          throw new errors.badRequest("Resource Type AKA and Data are mandatory");
        }

        // If there are only two parameters, assume that it is something like this:
        // ('#/resource/types/foo', { body: 'is here' });
        // because these two fields are mandatory
        if (!turbotData && !data) {
          data = resourceTypeAka;
          resourceTypeAka = parentId;

          // Default parent id as the current executing control resource
          parentId = self.meta.resourceId;
          turbotData = null;
        } else if (!turbotData) {
          // Here we have three parameters so we have to do some guesswork what is the
          // intention of the mod developer
          if (_.isString(parentId)) {
            // ('#/resource/types/foo', { body: 'is here' }, { akas: [] });
            turbotData = data;
            data = resourceTypeAka;
            resourceTypeAka = parentId;
            parentId = self.meta.resourceId;
          } else {
            // (null, '#/resource/types/foo', { body: 'is here' });
            turbotData = null;
          }
        }

        // Remove type when server side has been changed
        const command = {
          type: "resource_create",
          meta: {
            parentId: parentId,
            typeAka: resourceTypeAka,
            type: resourceTypeAka
          },
          payload: {
            data: data,
            turbotData: turbotData
          }
        };

        command.meta = self.setCommandMeta(command.meta, turbotData);
        command.payload = _.omitBy(command.payload, _.isNil);

        const msg = `Create resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, { data, turbotData });

        self._command(command);
        return self;
      },

      upsertGQL: function(parentId, resourceTypeAka, data, turbotData) {
        if (!turbotData && !data && !resourceTypeAka) {
          throw new errors.badRequest("Resource Type AKA and Data are mandatory");
        }

        // If there are only two parameters, assume that it is something like this:
        // ('#/resource/types/foo', { body: 'is here' });
        // because these two fields are mandatory
        if (!turbotData && !data) {
          data = resourceTypeAka;
          resourceTypeAka = parentId;

          // Default parent id as the current executing control resource
          parentId = self.meta.resourceId;
          turbotData = null;
        } else if (!turbotData) {
          // Here we have three parameters so we have to do some guesswork what is the
          // intention of the mod developer
          if (_.isString(parentId)) {
            // ('#/resource/types/foo', { body: 'is here' }, { akas: [] });
            turbotData = data;
            data = resourceTypeAka;
            resourceTypeAka = parentId;
            parentId = self.meta.resourceId;
          } else {
            // (null, '#/resource/types/foo', { body: 'is here' });
            turbotData = null;
          }
        }

        const query = `mutation UpsertResource($input: RunnableUpsertResourceInput!) {
          upsertResource(input: $input) {
            turbot {
              id
            }
          }
        }`;

        const variables = {
          input: {
            parent: parentId,
            type: resourceTypeAka,
            data: data
          }
        };

        _.merge(variables.input, turbotData);
        if (!variables.input.metadata) {
          variables.input.metadata = _.get(turbotData, "custom");
        }

        delete variables.input.custom;

        variables.input = self.setGraphqlVariablesActors(variables.input, turbotData);

        const command = {
          type: "graphql",
          query,
          variables
        };

        const msg = `Upsert resource ${command.variables.input.type} with parent: ${command.variables.input.parentId}.`;
        self.log.info(msg, { data, turbotData });

        self._command(command);
        return self;
      },

      /**
       * resourceId: parent
       */
      upsert: function(parentId, resourceTypeAka, data, turbotData) {
        if (!turbotData && !data && !resourceTypeAka) {
          throw new errors.badRequest("Resource Type AKA and Data are mandatory");
        }

        // If there are only two parameters, assume that it is something like this:
        // ('#/resource/types/foo', { body: 'is here' });
        // because these two fields are mandatory
        if (!turbotData && !data) {
          data = resourceTypeAka;
          resourceTypeAka = parentId;

          // Default parent id as the current executing control resource
          parentId = self.meta.resourceId;
          turbotData = null;
        } else if (!turbotData) {
          // Here we have three parameters so we have to do some guesswork what is the
          // intention of the mod developer
          if (_.isString(parentId)) {
            // ('#/resource/types/foo', { body: 'is here' }, { akas: [] });
            turbotData = data;
            data = resourceTypeAka;
            resourceTypeAka = parentId;
            parentId = self.meta.resourceId;
          } else {
            // (null, '#/resource/types/foo', { body: 'is here' });
            turbotData = null;
          }
        }

        const command = {
          type: "resource_upsert",
          meta: {
            parentId: parentId,
            type: resourceTypeAka,
            typeAka: resourceTypeAka
          },
          payload: {
            data: data,
            turbotData: turbotData
          }
        };

        command.meta = self.setCommandMeta(command.meta, turbotData);
        command.payload = _.omitBy(command.payload, _.isNil);

        const msg = `Upsert resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, { data, turbotData });

        self._command(command);
        return self;
      },

      put: function(resourceId, data, turbotData) {
        return self._resource("put", resourceId, data, turbotData);
      },

      /***
       * The fuzzy smart logic works as long as data is not a string. If data is a string
       * pass the first three parameters
       * resourceId/aka, path, data, turbotData <opt>
       */
      putPath: function(resourceId, path, data, turbotDataPath, turbotData) {
        if (arguments.length < 2) {
          throw new errors.badRequest("Path and data must be specified");
        }

        let id;

        if (/^\d{15}$/.test(resourceId)) {
          // If resourceId is 15 digit number then it's the resource id
          id = resourceId;
        } else if (_.isString(resourceId) && (_.isPlainObject(path) || Array.isArray(path) || path === null)) {
          // two parameters: putPath('foo.bar',  { data: 'Object } )
          // assume it's against the existing resource
          id = self.meta.resourceId;
          data = path;
          path = resourceId;
        } else if (
          _.isString(resourceId) &&
          _.isString(path) &&
          (_.isPlainObject(data) || _.isString(data) || Array.isArray(data) || data === null)
        ) {
          // Three parameters but the first one is aka

          // This only works if all 5 parameters are supplied
          id = null;
          if (!turbotData) {
            turbotData = {};
          }

          _.defaults(turbotData, { akas: [resourceId] });
        } else if (!resourceId && path && data && !turbotDataPath && !turbotData) {
          // three parameters: putPath(null, 'path.prop, { my: 'object' })
          id = self.meta.resourceId;
        } else if (arguments.length === 5 && !resourceId) {
          // if we want to pass null in the first parameter then we need to pass all 5 parameters
          id = self.meta.resourceId;
        }

        if (!id && !resourceId) {
          throw new errors.badRequest("Unable to set id or aka for the putPath command");
        }

        // Do not check if data exist because we use null to indicate that
        // we want to delete the given path
        const command = {
          type: "resource_putPath",
          meta: {
            resourceId: id,
            path: path,
            turbotDataPath: turbotDataPath
          },
          payload: {
            data: data,
            turbotData: turbotData
          }
        };

        command.meta = self.setCommandMeta(command.meta, turbotData);
        if (_.isPlainObject(turbotData)) {
          command.payload.turbotData = _.omitBy(command.payload.turbotData, _.isNil);
        }

        // print aka or the id
        const msg = "put path resource: " + (id || resourceId) + ".";
        self.log.info(msg, { data, turbotData });
        self._command(command);
        return self;
      },

      putPaths: function(resourceId, data, turbotData) {
        return self._resource("putPaths", resourceId, data, turbotData);
      },

      update: function(resourceId, data, turbotData) {
        return self._resource("update", resourceId, data, turbotData);
      },

      /**
       * Delete resource by id or aka.
       * @param {*} resourceId resource id or aka. If not supplied the default control's resource will be
       * deleted.
       */
      delete: function(resourceId) {
        if (!resourceId) {
          resourceId = self.meta.resourceId;
        }

        self._resource("delete", resourceId);
        self.resourcesToBeDeleted.push(resourceId);

        return self;
      },

      notify: function(resourceId, icon, message, data) {
        if (!/\d+/.test(resourceId)) {
          data = message;
          message = icon;
          icon = resourceId;
          resourceId = self.meta.resourceId;
        }
        const command = {
          type: "resource_notify",
          meta: {
            resourceId
          },
          payload: {
            icon,
            message
          }
        };
        if (data) {
          command.payload.data = data;
        }
        command.meta = self.setCommandMeta(command.meta, {});
        self._command(command);
        return self;
      }
    };
  }

  get input() {
    var self = this;
    return {
      set: function(path, value) {
        const command = {
          type: "input_set",
          meta: {},
          payload: {
            data: {
              path: path,
              value: value
            }
          }
        };
        self._command(command);
        return self;
      }
    };
  }

  //
  // POLICIES
  //

  _policy(type, resourceId, policyTypeAka, value, opts) {
    if (!/\d+/.test(resourceId)) {
      opts = value;
      value = policyTypeAka;
      policyTypeAka = resourceId;
      resourceId = this.meta.resourceId;
    }
    // Avoiding lodash, this is a variant of _.isPlainObject(value)
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      opts = value;
      value = undefined;
    }
    // Create and put set the requirement to must by default. Update should not change the current setting.
    var defaultOpts = {};
    if (type !== "update") {
      defaultOpts.requirement = "must";
    }
    var data = Object.assign(defaultOpts, opts);
    if (value !== undefined) {
      data.value = value;
    }
    const command = {
      type: "policy_" + type,
      meta: {
        resourceId,
        type: policyTypeAka
      },
      payload: data
    };
    let msg = `${type.slice(0, 1).toUpperCase() + type.slice(1)} policy ${policyTypeAka} for resource ${
      command.meta.resourceId
    } as ${command.payload.requirement}: ${JSON.stringify(value)}.`;
    this.log.info(msg, data);
    this._command(command);
    return this;
  }

  _policyGQL(type, resourceId, policyTypeAka, value, opts) {
    if (!/\d+/.test(resourceId)) {
      opts = value;
      value = policyTypeAka;
      policyTypeAka = resourceId;
      resourceId = this.meta.resourceId;
    }
    // Avoiding lodash, this is a variant of _.isPlainObject(value)
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      opts = value;
      value = undefined;
    }
    // Create and put set the requirement to must by default. Update should not change the current setting.
    var defaultOpts = {};
    if (type !== "update") {
      defaultOpts.requirement = "must";
    }
    var data = Object.assign(defaultOpts, opts);
    if (value !== undefined) {
      data.value = value;
    }

    let query;
    if (type === "create") {
      query = `mutation CreatePolicySetting($input: CreatePolicySettingInputs!) {
        createPolicySetting(input: $input) {
          turbot {
            id
          }
        }
      }`;
    }

    let variables = {
      input: {
        resource: resourceId,
        type: policyTypeAka
      }
    };

    variables = Object.assign(variables, data);

    const command = {
      type: "graphql",
      query,
      variables
    };

    let msg = `${type.slice(0, 1).toUpperCase() + type.slice(1)} policy ${policyTypeAka} for resource ${
      command.meta.resourceId
    } as ${command.payload.requirement}: ${JSON.stringify(value)}.`;
    this.log.info(msg, data);

    self._command(command);
    return self;
  }

  get policy() {
    const self = this;
    return {
      // policy settings function
      create: function(resourceId, policyTypeAka, value, opts) {
        return self._policy("create", resourceId, policyTypeAka, value, opts);
        //return self._policyGQL("create", resourceId, policyTypeAka, value, opts);
      },

      put: function(resourceId, policyTypeAka, value, opts) {
        return self._policy("put", resourceId, policyTypeAka, value, opts);
      },

      update: function(resourceId, policyTypeAka, value, opts) {
        return self._policy("update", resourceId, policyTypeAka, value, opts);
      },

      delete: function(resourceId, policyTypeAka) {
        if (!/\d+/.test(resourceId)) {
          policyTypeAka = resourceId;
          resourceId = self.meta.resourceId;
        }
        const command = {
          type: "policy_delete",
          meta: {
            resourceId,
            type: policyTypeAka
          }
        };
        let msg = `Delete policy ${policyTypeAka} for resource: ${command.meta.resourceId}`;
        self.log.info(msg);
        self._command(command);
        return self;
      },

      // policy state & value functions
      ok: function(value) {
        // return self._stateStagerGQL("ok", "", value);
        return self._stateStager("ok", "", value);
      },

      tbd: function(reason, data) {
        return self._stateStager("tbd", reason, data);
      },

      invalid: function(reason, data) {
        return self._stateStager("invalid", reason, data);
      },

      error: function(reason, data) {
        return self._stateStager("error", reason, data);
      },

      nextRun: function(data) {
        self.cargoContainer.nextRun = data;
      }
    };
  }

  get report() {
    const self = this;
    return {
      // report state functions
      ok: function(value) {
        return self._stateStager("ok", { value });
      },

      tbd: function(reason, data) {
        return self._stateStager("tbd", reason, data);
      },

      invalid: function(reason, data) {
        return self._stateStager("invalid", reason, data);
      },

      error: function(reason, data) {
        return self._stateStager("error", reason, data);
      }
    };
  }

  //
  // GRANT
  //

  get grant() {
    const self = this;
    return {
      delete: function(grantId, resourceId, profileId) {
        if (!/\d+/.test(grantId)) {
          throw new errors.badRequest("Grant Id must be specified.");
        }
        const command = {
          type: "grant_delete",
          meta: {
            resourceId,
            grantId,
            profileId
          }
        };
        let msg = `Delete grant ${grantId} for resource: ${command.meta.resourceId} of profile: ${profileId}`;
        self.log.info(msg);
        self._command(command);
        return self;
      }
    };
  }

  //
  // ACTIVE GRANT
  //

  get grantActivation() {
    const self = this;
    return {
      delete: function(activeGrantId, resourceId) {
        if (!/\d+/.test(activeGrantId)) {
          throw new errors.badRequest("Grant Activation Id must be specified.");
        }
        const command = {
          type: "grantActivation_delete",
          meta: {
            resourceId,
            activeGrantId
          }
        };
        let msg = `Delete active grant ${activeGrantId} for resource: ${command.meta.resourceId}`;
        self.log.info(msg);
        self._command(command);
        return self;
      }
    };
  }

  //
  // EVENTS
  //

  get event() {
    const self = this;
    return {
      raise: function(aka, eventType, event, turbotData, eventLockId) {
        const command = {
          type: "event_raise",
          meta: {
            aka: aka,
            eventType: "event.turbot.com:External",
            eventRaw: eventType,
            eventLockId: eventLockId
          },
          payload: event
        };

        command.meta = self.setCommandMeta(command.meta, turbotData);

        const msg = `Raise event for aka ${aka}.`;
        self.log.info(msg, { event: event, turbotData: turbotData });
        self._command(command);
        return self;
      }
    };
  }

  //
  // COMMANDS
  //

  // Backward compatibility (not really needed .. in inline we control all the libs)
  asProcessEvent() {
    return this.send();
  }

  sendFinal(callback) {
    this.terminate();
    this.cargoContainer.stop();
    return this.cargoContainer.send(callback);
  }

  send(callback) {
    return this.cargoContainer.send(callback);
  }
}

class CargoContainer {
  constructor(meta, opts) {
    this.logEntries = [];
    this.commands = [];
    this.largeCommands = {};
    this.largeCommandsSize = 0;

    this.meta = meta;
    this.opts = opts;

    this.series = uuidv4();
    this.sequence = 0;

    this.live = meta.live;
    this.currentSize = 0;

    this.inline = opts.inline;
    this.senderFunction = opts.senderFunction;

    this.phase = "update";
    this._stop = false;

    this.s3PresignedUrl = meta.s3PresignedUrl;

    const metaString = JSON.stringify(this.meta);
    this.metaSize = Buffer.byteLength(metaString);
  }

  log(logEntry) {
    let stringOutput = JSON.stringify(logEntry);
    let size = Buffer.byteLength(stringOutput);

    // Need to include the meta size as at minimum we need to send the meta size too
    if (this.metaSize + size > 200000) {
      if (_.isString(logEntry.message)) {
        logEntry.message = "Log item too large. Message: " + logEntry.message.slice(0, 1024) + ". Size: " + size;
      } else {
        logEntry.message = "[Log item too large - no message supplied]. Size: " + size;
      }

      // At one stage we have an error, tried to log the error but the data object too big.
      // This is not ideal, but will get us through, as long as the message is only nested 1 level.
      const nestedMessage = _.get(logEntry, "data.error.message");
      if (nestedMessage) {
        logEntry.message += ". Nested message: " + nestedMessage.slice(0, 1024);
      }

      logEntry.data = {};
      stringOutput = JSON.stringify(logEntry);
      size = Buffer.byteLength(stringOutput);
    }

    // If by adding this log entry we will breach the size, send immediately whatever we have in the buffer and only then add the log entries
    if (this.metaSize + size + this.currentSize > 250000) {
      if (this.opts.inline) {
        throw errors.internal("Inline payload too large", { size: size + this.currentSize });
      }

      if (!this.live) {
        // If not live then don't stream .. we'll collect and switch to "large command v2" mode
        this.largeCommandV2 = true;
      } else {
        this.send();
      }
    }

    this.currentSize += size;
    this.logEntries.push(logEntry);
  }

  command(command) {
    let stringOutput = JSON.stringify(command);
    let size = Buffer.byteLength(stringOutput);

    command.meta.id = uuidv4();

    if (size > 1048576) {
      throw errors.badRequest("Maximum command size is 1 MB");
    }

    if (this.largeCommandV2) {
      this.currentSize += size;
      this.commands.push(command);
      return;
    }

    if (!this.live && !this.opts.inline) {
      // If not live and in Lambda/Container, we have a much easier logic

      if (this.metaSize + size + this.currentSize > 250000) {
        // Introduced new mode for backward compatibility in the @turbot/fn package.
        this.largeCommandV2 = true;
      }

      // Just keep adding it to the commands, we'll sort it out at the end
      this.currentSize += size;
      this.commands.push(command);
      return;
    }

    // LargeCommandMode is used mainly for testing and used by some older mods, keep this until it's no longer used
    // by any mod
    if (this.largeCommandMode || size > 225000 || this.metaSize + size + this.currentSize > 250000) {
      // Then moment we receive a "large command" we need to stop sending/streaming the data, because s3 presigned URL
      // can only receive one item. So we have to stop the streaming and collect all the commands.
      this.stop();

      this.largeCommandV2 = true;

      // Just like the previous logic (non-streaming mode) keep collecting the data
      // until right the end
      this.commands.push(command);

      // Update the size
      this.currentSize += size;

      // Don't forget to return
      return;
    }

    // If by adding this command we will breach the size, send immediately
    if (size + this.currentSize > 225000) {
      // Do not allow to send during inline execution, this should never happen though
      // if the command sizing is correct
      if (this.opts.inline) {
        throw errors.internal("Inline payload too large. ", { size: size + this.currentSize });
      }

      this.send();
    }

    this.currentSize += size;
    this.commands.push(command);
  }

  asProcessEvent() {
    // Event passes back the metadata it received, in particular, including the $token to authenticate the
    // commands.
    const event = { meta: this.meta };

    event.meta.series = this.series;
    event.meta.messageSequence = this.sequence++;

    if (this.largeCommandV2) {
      event.meta.mode = "largeCommandV2";
    }

    const payload = {};

    if (this.logEntries.length > 0) {
      payload.log = this.logEntries;
    }

    const commands = this.commands;

    if (commands.length > 0) {
      // Send any commands with the event
      payload.commands = commands;
    }

    if (this.nextRun) {
      payload.nextRun = this.nextRun;
    }

    event.type = `process.turbot.com:${this.phase}`;

    if (Object.keys(payload).length > 0) {
      event.payload = payload;
    }

    return event;
  }

  stop() {
    this._stop = true;
  }

  streamData() {
    const self = this;

    asyncjs.forever(
      next => {
        if (self._stop) {
          return;
        }

        // If there's nothing don't send because we're just polluting the event bus
        // initially we were thinking of a "heartbeat" to indicate that the process
        // is still working. But this is not implemented yet and the effect of sending this
        // heartbeats is unnecessary messages in the event bus
        if (!_.isEmpty(this.logEntries) || !_.isEmpty(this.commands)) {
          self.send();
        }

        _.delay(next, this.opts.delay);
      },
      err => {
        self.log.error("Error in Cargo Container stream data", err);
      }
    );
  }

  send(callback) {
    if (this.largeCommandV2) {
      // If we are in the large command v2 mode, we need to clear the commands array because it should be saved in the s3 presigned url.
      // not being sent back to SQS
      this.commands = [];
      this.logEntries = [];
      this.meta.largeCommandV2 = true;
    }

    const processEvent = this.asProcessEvent();

    // Before calling the sender function (that will be async)
    // empty the commands and logEntries while we still have the execution
    // context - this is optimistic
    this.logEntries = [];
    this.commands = [];
    this.currentSize = 0;

    if (this.senderFunction) {
      this.senderFunction(processEvent, this.opts, callback);
    }

    // also return what was generated
    return processEvent;
  }
}

module.exports = { Turbot };
