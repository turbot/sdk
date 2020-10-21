# Turbot SDK

# Release History

## 5.7.1 [2020-10-22]

- Fixed: should not modify the cargo content after it has been finalized for sending it back to Turbot server.

## 5.7.0 [2020-07-30]

- Updated: @turbot/errors to 5.1.0. @turbot/utils to 5.2.0. Various dev dependencies. #32.

## 5.6.0 [2020-07-30]

- Updated: disable live events.
- Updated: lodash to 4.17.19, uuid to 8.3.0

## 5.5.0 [2020-06-22]

- Updated: generated message for upsert and insert operation to be "no parent" instead of "parent: null".
- Updated: uuid to 8.1.0

## 5.4.0 [2020-04-30]

- Updated: @turbot/utils to 5.1.0, async to 3.2.0, uuid to 3.4.0. Various dev dependencies.

## 5.3.0 [2020-04-20]

- Added: `turbot.set` command to set `nextRun` and `dependencies` instructions. Valid value for `nextRun` is a valid MomentJS duration object. Valid value for `dependencies` is `RECALCULATE`.

## 5.2.1 [2020-03-13]

- Fixed: turbot.policy.setting.upsert() SDK command.
- Fixed: turbot.policy.ok(0) should return the value 0 instead of undefined (regression in v5.0.0).
- Fixed: turbot.policy.ok(false) should return false in data field (regression in v5.0.0).

## 5.2.0 [2020-03-13]

- Added: turbot.policy.setting.upsert() SDK command.

## 5.1.2 [2020-02-05]

- Updated: @turbot/utils to 5.0.6.
- Fixed: incorrect log messages for resource operations.

## 5.1.1 [2010-02-04]

- Fixed: create & update resource SDK API where the first parameter is the resource id.

## 5.1.0 [2010-01-20]

- Updated: async to 3.1.0.
- Updated: lodash to 4.17.15.
- Fixed: turbot.notify(controlId) incorrectly sends all notification for the control in the parameter even for the notification that belongs to other controls.

## 5.0.2 [2020-01-20]

- Updated: @turbot/utils to 5.0.5.
- Updated: license to Apache 2.0.
- Fixed: turbot.notify(controlId) does not work when called from an action.

## 5.0.1 [2019-12-27]

- Updated: @turbot/utils to version 5.0.4.

## 5.0.0 [2019-12-09]

Initial v5.0.0 release.

- Updated: changed SDK commands from object based structure to GraphQL based structures.

## 5.0.0-beta.6 [2019-11-18]

- Updated: dependencies

## 5.0.0-beta.5 [2019-11-18]

- Fixed: turbot.policy.ok(0) should return the value 0 instead of undefined.
- Fixed: turbot.policy.ok(false) should return false in data field.

## 5.0.0-beta.4 [2019-10-10]

- Updated: don't send data in live mode if there's nothing to send.

## 5.0.0-beta.3 [2019-10-09]

- Updated: non live operation shouldn't stream large data, instead collect them all and zip as "large commands" instead.

## 5.0.0-beta.2 [2019-07-16]

- Added: eventLockId parameter in event.raise command.
- Updated: lodash dependency to 4.17.14.

## 5.0.0-beta.1 [2019-07-10]

- Initial beta release.
