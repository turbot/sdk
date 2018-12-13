const _ = require("lodash");

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
    this.logEntries = [];
    this.process = null;

    this.commands = [];

    this.opts = _.clone(opts);
    _.defaults(this.opts, { type: "control" });
  }

  /**
   * 13/08 - This class was merged from two different modules sdk-control and a Turbot class
   * inside the function module. It's a bit messy for now while I'm trying to get it to work.
   *
   * Check if the 'action' is needed?
   */
  initializeForEvent(event) {
    console.log("initializeForEvent called with event", event);
    this._status = null;
    this._log = [];
    this._actions = [];
    this._commands = [];

    const command = _.get(event, "command");
    if (command) {
      this._command = command;
    }

    this._envId = _.get(event, "command.payload.envId", null);
    if (!this._envId) {
      this._envId = _.get(event, "command.meta.envId", null);
    }

    this._tenantId = _.get(event, "command.payload.tenantId", null);
    if (!this._tenantId) {
      this._tenantId = _.get(event, "command.meta.tenantId", null);
    }

    this._trace = _.get(event, "command.meta.trace", false);

    if (!event || !event.turbot) {
      return this;
    }
    if (event.turbot.env) {
      this._envId = event.turbot.env.id;
    }
    if (event.turbot.tenant) {
      this._tenantId = event.turbot.tenant.id;
    }
  }

  /**
   * Finalize function.
   *
   * @param {function} callback
   */
  finalize(callback) {
    return (err, results) => {
      if (err) {
        this.error("ERROR in function for ENV " + this.envId + " / TENANT " + this.tenantId, err);
      }

      // Raise all actions and log all log entries
      // console.log("FINALIZER - status: ", this.status);
      console.log("FINALIZER - logs: ", this._log);
      // console.log("FINALIZER - actions: ", this._actions);
      callback(err, results);
    };
  }

  //
  // Environment
  //
  // TODO: 13/08 should we split this functionality?
  //
  get envId() {
    return this._envId;
  }

  set envId(id) {
    this._envId = id;
  }

  get tenantId() {
    return this._tenantId;
  }

  set tenantId(id) {
    this._tenantId = id;
  }

  get trace() {
    return this._trace;
  }

  //
  // PROCESS
  //

  _process(state) {
    if (this.process) {
      this.log.warning(`Process state previously set to: ${this.process.state}. Resetting.`, this.process);
    }
    this.process = { state, timestamp: new Date() };
    this.log.info(`Setting process state: ${this.process.state}.`, this.process);
  }

  update() {
    this._process("update");
  }

  terminate() {
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
    this.commands.push(data);
    return data;
  }

  //
  // LOGGING
  //

  _logger(level, message, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message || ""
    };

    // use explicit undefined check rather than truthiness check as we want to allow zero/false values through
    entry.data = typeof data == "undefined" ? {} : data;

    // TODO - limit the size / number of possible log entries to prevent flooding
    // TODO - Sanitize output
    this.logEntries.push(entry);
    return this;
  }

  get log() {
    var self = this;
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
    if (!runnableId) {
      switch (this.opts.type) {
        case "action":
          runnableId = this.meta.actionId;
          break;
        case "policy":
          runnableId = this.meta.policyId;
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
    // Support the case where they pass in an object for data, but no reason.
    if (!data && typeof reason != "string") {
      data = reason;
      reason = null;
    }
    if (reason) {
      newState.reason = reason;
    }
    // TODO - sanitize?
    if (data) {
      newState.data = data;
    }
    this.log.info(`Update ${this.opts.type} state: ${newState.state}.`, newState);

    const meta = {};
    meta[`${this.opts.type}Id`] = runnableId;

    this._command({
      type: `${this.opts.type}_update`,
      meta: meta,
      payload: newState
    });
    return this;
  }

  _stateStager(state, arg1, arg2, arg3) {
    let controlId, reason, data;
    if (/\d+/.test(arg1)) {
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

  ok(controlId, reason, data) {
    return this._stateStager("ok", controlId, reason, data);
  }

  alarm(controlId, reason, data) {
    return this._stateStager("alarm", controlId, reason, data);
  }

  skipped(controlId, reason, data) {
    return this._stateStager("skipped", controlId, reason, data);
  }

  error(controlId, reason, data) {
    return this._stateStager("error", controlId, reason, data);
  }

  insufficient_data(controlId, reason, data) {
    return this._stateStager("insufficient_data", controlId, reason, data);
  }

  invalid(controlId, reason, data) {
    return this._stateStager("invalid", controlId, reason, data);
  }

  tbd(controlId, reason, data) {
    return this._stateStager("tbd", controlId, reason, data);
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
      run: function(actionUri, data) {
        self._command({
          type: "action_run",
          meta: { controlId: self.meta.controlId, actionUri: actionUri },
          payload: data
        });
      }
    };
  }

  get control() {
    const self = this;
    return {
      run: function(controlUri, data) {
        self._command({
          type: "control_run",
          meta: { controlId: self.meta.controlId, controlUri: controlUri },
          payload: data
        });
      }
    };
  }

  //
  // STATE MANAGEMENT FOR ACTIONS
  //

  _actionStateStager(state, arg1, arg2, arg3) {
    let actionId, reason, data;
    if (/\d+/.test(arg1)) {
      actionId = arg1;
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

    return this._state(state, actionId, reason, data);
  }

  succeed(actionId, reason, data) {
    return this._actionStateStager("succeed", actionId, reason, data);
  }

  fail(actionId, reason, data) {
    return this._actionStateStager("fail", actionId, reason, data);
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
      case "control":
      default: {
        command.meta.controlId = this.meta.controlId;
        command.payload.meta.controlId = this.meta.controlId;
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

  _resource(type, resourceId, data) {
    let command = {
      type: "resource_" + type,
      meta: {
        resourceId: resourceId || this.meta.resourceId
      }
    };
    if (data) {
      command.payload = data;
    }
    let msg = type.slice(0, 1).toUpperCase() + type.slice(1) + " resource: " + command.meta.resourceId + ".";
    this.log.info(msg, data);
    this._command(command);
    return this;
  }

  get resource() {
    var self = this;
    return {
      create: function(resourceId, resourceTypeAka, data, inputMeta = null) {
        if (!inputMeta) {
          inputMeta = data;
          data = resourceTypeAka;
          resourceTypeAka = resourceId;
          resourceId = null;
        }
        const command = {
          type: "resource_create",
          meta: {
            parentId: resourceId || self.meta.resourceId,
            type: resourceTypeAka
          }
        };
        if (data) {
          command.payload = data;
        }
        _.defaults(command.meta, inputMeta);
        const msg = `Create resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, data);
        self._command(command);
        return self;
      },

      /**
       * resourceId: parent
       */
      upsert: function(resourceId, resourceTypeAka, data, inputMeta = null) {
        if (!inputMeta) {
          inputMeta = data;
          data = resourceTypeAka;
          resourceTypeAka = resourceId;
          resourceId = null;
        }

        const command = {
          type: "resource_upsert",
          meta: {
            parentId: resourceId || self.meta.resourceId,
            type: resourceTypeAka
          }
        };
        if (data) {
          command.payload = data;
        }
        _.defaults(command.meta, inputMeta);
        const msg = `Create resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, data);
        self._command(command);
        return self;
      },

      put: function(resourceId, data) {
        if (!data) {
          data = resourceId;
          resourceId = null;
        }
        return self._resource("put", resourceId, data);
      },

      update: function(resourceId, changes) {
        if (!changes) {
          changes = resourceId;
          resourceId = null;
        }
        return self._resource("update", resourceId, changes);
      },

      delete: function(resourceId, data) {
        if (!data) {
          data = resourceId;
          resourceId = null;
        }
        return self._resource("delete", resourceId, data);
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
    if (type != "update") {
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

  get policy() {
    const self = this;
    return {
      create: function(resourceId, policyTypeAka, value, opts) {
        return self._policy("create", resourceId, policyTypeAka, value, opts);
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

      // policy state functions
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
  // EVENTS
  //

  get event() {
    const self = this;
    return {
      raise: function(aka, eventType, event) {
        const command = {
          type: "event_raise",
          meta: {
            aka: aka,
            eventType: "event.turbot.com:External",
            eventRaw: eventType
          },
          payload: event
        };
        const msg = `Raise event for aka ${aka}.`;
        self.log.info(msg, event);
        self._command(command);
        return self;
      }
    };
  }

  //
  // COMMANDS
  //

  asProcessEvent() {
    const opts = {
      // State updates typically mean that the process is complete. Treat that as the default.
      terminateIfCommands: true
    };

    // Event passes back the metadata it received, in particular, including the $token to authenticate the
    // commands.
    const event = { meta: this.meta };

    const payload = {};

    if (this.logEntries.length > 0) {
      payload.log = this.logEntries;
    }

    const commands = this.commands;

    if (commands.length > 0) {
      // Send any commands with the event
      payload.commands = commands;
      // By default, if there was an action, we terminate the process.
      if (opts.terminateIfCommands && !this.process) {
        this.terminate();
      }
    }

    // TODO: change this to capitalise the first letter
    // Create a process event (update, terminate) wrapping all of the outcomes from the inline run.
    if (this.process && this.process.state) {
      event.type = "process.turbot.com:" + this.process.state;
    } else {
      // By default, it's just an update to the existing process.
      event.type = "process.turbot.com:update";
    }

    if (Object.keys(payload).length > 0) {
      event.payload = payload;
    }

    return event;
  }
}

module.exports = { Turbot };
