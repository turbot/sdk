const { Turbot } = require("../");
const _ = require("lodash");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk", function() {
  this.timeout(20000);

  it("setting state should fail after deleting a resource", function() {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });

    turbot.resource.delete();
    try {
      turbot.ok("this should throw an exception");
    } catch (ex) {
      return;
    }

    assert.fail("turbot.ok should throw an exception");
  });

  it("shouldn't be able to delete the same item twice", function() {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });

    turbot.resource.delete();
    try {
      turbot.resource.delete();
    } catch (ex) {
      return;
    }

    assert.fail("second turbot.delete should throw an exception");
  });

  it("shouldn't be able to delete the same item twice - in a series", function() {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });

    turbot.resource.delete();
    turbot.resource.delete("global-aka");
    try {
      turbot.resource.delete("global-aka");
    } catch (ex) {
      return;
    }

    assert.fail("third turbot.delete should throw an exception");
  });

  xit("log", function() {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });
    turbot.log.warning("Foo 1", { data: "bar" });
    turbot.log.warning("Foo 2", { data: "bar", key: "value" });

    turbot.sensitiveExceptions = ["key"];

    turbot.log.warning("Foo 3", { data: "bar", key: "value2" });
    turbot.log.warning("Foo 4", { data: "bar", password: "value2" });

    turbot.sensitiveExceptions = ["key", "password"];
    turbot.log.warning("Foo 4", { data: "bar", password: "value2" });

    console.log("JSON", JSON.stringify(turbot.cargoContainer.logEntries));
  });
});
