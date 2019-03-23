const _ = require("lodash");
const asyncjs = require("async");
const errors = require("@turbot/errors");
const utils = require("@turbot/utils");

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

    // Setting this 1 second makes it losing messages
    _.defaults(this.opts, { type: "control", delay: 2000 });

    // Prefer the log level in opts rather than environment variable
    this.logLevel = opts.logLevel || process.env.TURBOT_LOG_LEVEL;
    if (!this.logLevel) {
      this.logLevel = "warning";
    }

    this.cargoContainer = new CargoContainer(meta, opts);

    if (this.meta.live && !this.opts.inline) {
      asyncjs.forever(
        next => {
          if (this._stop) {
            return;
          }
          this.cargoContainer.send();
          _.delay(next, this.opts.delay);
        },
        err => {
          console.error("Error", err);
        }
      );
    }
  }

  stop() {
    this._stop = true;
  }

  /**
   * 13/08 - This class was merged from two different modules sdk-control and a Turbot class
   * inside the function module. It's a bit messy for now while I'm trying to get it to work.
   *
   */
  initializeForEvent(event) {
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

    const logEntry = utils.data.sanitize(entry, {
      breakCircular: true
    });

    // const stream = LOG_LEVELS[level].value > LOG_LEVELS.error.value ? "error" : "log";
    // if (LOG_LEVELS[level].value >= LOG_LEVELS[this.logLevel].value) {
    //   console[stream](logEntry);
    // }

    // TODO - limit the size / number of possible log entries to prevent flooding
    //this.logEntries.push(logEntry);

    this.cargoContainer.log(logEntry);
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

    // If the execution type if policy then we have a slightly different logic
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
        if (data) {
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

  ok(controlId, reason, data) {
    this.terminate();
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
        // TODO: the actionUri should be in the payload not meta. See how the control.run is done
        const meta = { controlId: self.meta.controlId, actionUri: actionUri };
        if (self.meta.pid) {
          meta.parentProcessId = self.meta.pid;
        }
        self._command({
          type: "action_run",
          meta: meta,
          payload: data
        });
      }
    };
  }

  get control() {
    const self = this;
    return {
      run: function(controlUri, data) {
        const payload = {
          meta: {
            controlUri: controlUri
          },
          data: data
        };

        const commandMeta = { controlId: self.meta.controlId, actionId: self.meta.actionId };
        if (self.meta.pid) {
          commandMeta.parentProcessId = self.meta.pid;
        }
        self._command({
          type: "control_run",
          meta: commandMeta,
          payload: payload
        });
      },
      nextRun: function(data) {
        self.cargoContainer.nextRun = data;
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

  _resource(type, resourceId, data, turbotData) {
    let command = {
      type: "resource_" + type,
      meta: {
        resourceId: resourceId || this.meta.resourceId
      },
      payload: {
        data: data,
        turbotData: turbotData
      }
    };

    command.payload = _.omitBy(command.payload, _.isNil);

    let msg = type.slice(0, 1).toUpperCase() + type.slice(1) + " resource: " + command.meta.resourceId + ".";
    this.log.info(msg, data);
    this._command(command);
    return this;
  }

  get resource() {
    var self = this;
    return {
      create: function(resourceId, resourceTypeAka, data, turbotData = null) {
        if (!turbotData) {
          turbotData = data;
          data = resourceTypeAka;
          resourceTypeAka = resourceId;
          resourceId = null;
        }
        const command = {
          type: "resource_create",
          meta: {
            parentId: resourceId || self.meta.resourceId,
            type: resourceTypeAka
          },
          payload: {
            data: data,
            turbotData: turbotData
          }
        };

        command.payload = _.omitBy(command.payload, _.isNil);

        const msg = `Create resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, data);

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

        // If there are only two parameters, assume that it is someting like this:
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
            type: resourceTypeAka
          },
          payload: {
            data: data,
            turbotData: turbotData
          }
        };

        command.payload = _.omitBy(command.payload, _.isNil);

        const msg = `Upsert resource ${command.meta.type} with parent: ${command.meta.parentId}.`;
        self.log.info(msg, data);

        self._command(command);
        return self;
      },

      put: function(resourceId, data, turbotData) {
        if (!turbotData) {
          turbotData = data;
          data = resourceId;
          resourceId = self.meta.resourceId;
        }
        return self._resource("put", resourceId, data, turbotData);
      },

      update: function(resourceId, data, turbotData) {
        if (!turbotData) {
          turbotData = data;
          data = resourceId;
          resourceId = self.meta.resourceId;
        }
        return self._resource("update", resourceId, data, turbotData);
      },

      /**
       * Delete resource by id or aka.
       * @param {*} resourceId resource id
       * @param {*} data If deleting by aka data should be in this format: { akas: [aka]}
       */
      delete: function(resourceId, turbotData) {
        return self._resource("delete", resourceId, turbotData);
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
        return self._stateStager("ok", value);
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
  // EVENTS
  //

  get event() {
    const self = this;
    return {
      raise: function(aka, eventType, event, opts) {
        const command = {
          type: "event_raise",
          meta: {
            aka: aka,
            eventType: "event.turbot.com:External",
            eventRaw: eventType
          },
          payload: event
        };

        if (opts) {
          _.defaults(command.meta, opts);
        }

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

  // Backward compatibility (not really needed .. in inline we control all the libs)
  asProcessEvent() {
    return this.send();
  }

  sendFinal(callback) {
    this.terminate();
    this.stop();
    return this.cargoContainer.send(callback);
  }
  send(callback) {
    return this.cargoContainer.send(callback);
  }
}

const uuidv4 = require("uuid/v4");
const LOG_LEVELS = require("./log-levels");

class CargoContainer {
  constructor(meta, opts) {
    this.logEntries = [];
    this.commands = [];

    this.meta = meta;
    this.opts = opts;

    this.series = uuidv4();
    this.sequence = 0;

    this.live = meta.live;
    this.currentSize = 0;

    this.inline = opts.inline;
    this.senderFunction = opts.senderFunction;

    this.phase = "update";
  }

  log(logEntry) {
    if (!this.live) {
      // If not live, discard non important stuff
      const logEntryLevel = _.get(LOG_LEVELS, `${logEntry.level}.value`);

      if (logEntryLevel > LOG_LEVELS["info"].value) {
        return;
      }
    }
    let stringOutput = JSON.stringify(logEntry);
    let size = Buffer.byteLength(stringOutput);

    if (size > 200000) {
      logEntry.data = {};
      logEntry.message = "[Log item too large]";
      stringOutput = JSON.stringify(logEntry);
      size = Buffer.byteLength(stringOutput);
    }

    // If by adding this log entry we will breach the size, send immediately
    if (size + this.currentSize > 200000) {
      if (this.opts.inline) {
        throw errors.internal("Inline payload too large", { size: size + this.currentSize });
      }

      this.send();
    }

    this.currentSize += size;
    this.logEntries.push(logEntry);
  }

  command(command) {
    let stringOutput = JSON.stringify(command);
    let size = Buffer.byteLength(stringOutput);

    if (size > 200000) {
      throw new Error("Command is too big");
    }

    // If by adding this command we will breach the size, send immediately
    if (size + this.currentSize > 200000) {
      // Do not allow to send during inline execution
      if (this.opts.inline) {
        throw errors.internal("Inline payload too large", { size: size + this.currentSize });
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

  send(callback) {
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
