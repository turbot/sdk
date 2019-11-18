### This is an experimental package - do not use.

# @turbot/sdk

The turbot JavaScript SDK simplifies writing controls, actions and calculated
policies for execution in a Turbot environment. It is generlly used as
a key component of [@turbot/fn](https://github.com/turbot/fn), which
establishes context and environment for Turbot when run inside an AWS
Lambda function.

## Install

The turbot SDK is used as a sub-component of `@turbot/fn` and should be installed through [@turbot/fn](https://github.com/turbot/fn) instead using:

```
npm install @turbot/fn
```

The turbot SDK can be used without `@turbot/fn` with the source downloadable from [GitHub](https://github.com/turbot/sdk). The easiest installation is through npm by running:

```
npm install @turbot/sdk
```

## SDK components

### Logging

- turbot.log.debug
- turbot.log.info
- turbot.log.notice
- turbot.log.warning
- turbot.log.error

#### turbot.log.{level}(message, data)

- Logging requires a message and data/or data to be processed
  Valid log levels are:

* error
* warning
* notice
* info
* debug
  Examples:
  turbot.log.debug("String message for logging");
  turbot.log.debug({object: "will", be: "logged", as: "data", with: "no", message: "string"});
  turbot.log.debug("A message", {and: "an", object: "works fine"});
  Limits:
  - Each log message with its data must be less than 256kB in size.

### States

- turbot.ok(reason, data)
- turbot.invalid(reason, data)
- turbot.error(reason, data)
- urbot.tbd(reason, data)
- turbot.skipped(reason, data)

### Action

- turbot.action.run(actionUri, parameters)
- turbot.action.run(aka, actionUri, parameters)
  - Run `actionUri` with `parameters` for resource `aka` (optional, defaults to target resource).
    Examples:
    turbot.action.run("tmod:@turbot/aws-s3#/action/types/bucketDelete");

### Policy

Policies that are set to manage the configuration settings for controls, return the states as per the conditions provided.

- turbot.policy.ok(value, reason, data)
- turbot.policy.invalid(reason, data)
- turbot.policy.error(reason, data)
- turbot.policy.tbd(reason, data)

| State   | Description                                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OK      | The state is returned when the Policy value is set correctly and is valid against the schema at the time it was set.                                                                                                                                                                                          |
| Invalid | State is returned when the Policy value is not set, Either a prerequisite was Invalid, or the value given for this policy was not valid against its schema. The previous value of the policy is still in place, but any controls or policies depending on this policy are blocked until it is in an OK state. |
| Error   | The state is returned when an unexpected error occurrs while calculating the policy. Human intervention is required to fix, and support may be required to review.                                                                                                                                            |
| TBD     | The state is returned when insufficient information or input has been provided for the policy to be calculated.                                                                                                                                                                                               |

### Control

#### turbot.control.{ok,alarm,skipped,error,invalid,tbd}(reason, data)

Set `controlId` (optional, defaults to target control) to be `{state}` with an optional `reason` and `data`.
| State | Description |
| -- | -- |
| OK | The state is returned when the control runs successfully with no change required.|
| Alarm | The state is returned when conditions are not met and changes are required in the resource or the environment.|
| Invalid | The state is returned when the policy settings require changes in order to meet the conditions or the environment needs configuration checks. The only resolution is by changes to the policies or different configurations. |
| Error | The state is returned when unexpected error occurs while executing the control. Human intervention is required to fix unexpected conditions, and support may be required to review. |
| TBD | The state is returned when insufficient information or input has been provided for the control to be executed. The state is fixed with correct required inputs.|
Examples:

- turbot.control.ok();
- turbot.control.invalid("Incompatible requirements or state that requires human intervention");
- turbot.control.error("Not Found", { more: "details" });
- turbot.control.tbd("Waiting on updates");
- turbot.control.skipped();

### Resource

- turbot.resource.create(parentId, resourceTypeAka, data, turbotData)
- turbot.resource.upsert(parentId, resourceTypeAka, data, turbotData))
- turbot.resource.put(resourceId,data, turbotData)
- turbot.resource.putPath(resourceId, path, data, turbotDataPath, turbotData)
- turbot.resource.putPaths(resourceId,data, turbotData)
- turbot.resource.update(resourceId,data, turbotData)
- turbot.resource.delete(resourceId)
- turbot.resource.notify(resourceId, icon, message, data)

| State    | Description                                                          |
| -------- | -------------------------------------------------------------------- |
| upsert   | It upsert the resource with the parentID                             |
| put      | It put the resource data in the CMDB with resourceId                 |
| putPaths | It put the resource data in the CMDB with                            |
| update   | It update the data of resource in the CMDB with the given resourceId |

Examples:

- turbot.resource.upsert(“#/resource/types/certificate”, resource, turbotData);
- turbot.resource.put(result, turbotData);
- turbot.resource.putPaths(result, turbotData);
- turbot.resource.update({ title: ‘New title’ });
- turbot.resource.delete(resourceId);

### Action

- turbot.action.ok(reason, data)
- turbot.action.invalid(reason, data)
- turbot.action.tbd(reason, data)
- turbot.action.error(reason, data)
- turbot.action.skipped(reason, data)
  Examples:
  turbot.action.ok()
  turbot.action.error()

### Notifications

- turbot.notify(icon, message, data)
- turbot.notify(controlId, icon, message, data)
