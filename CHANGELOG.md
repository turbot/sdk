# Turbot SDK

# Release History

## 5.0.1 [tbd]

- Updated: @turbot/utils to 5.0.5.

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
