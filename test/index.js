const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk", function () {
  it("setting state should fail after deleting a resource", function () {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });

    turbot.resource.delete();
    try {
      turbot.ok("this should throw an exception");
    } catch (ex) {
      return;
    }

    assert.fail("turbot.ok should throw an exception");
  });

  it("shouldn't be able to delete the same item twice", function () {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });

    turbot.resource.delete();
    try {
      turbot.resource.delete();
    } catch (ex) {
      return;
    }

    assert.fail("second turbot.delete should throw an exception");
  });

  it("shouldn't be able to delete the same item twice - in a series", function () {
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
});

describe("@turbot/sdk - log sensitive exceptions", function () {
  const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });
  turbot.log.warning("Foo 1", { data: "bar" });
  turbot.log.warning("Foo 2", { data: "bar", key: "value" });

  turbot.sensitiveExceptions = ["key"];

  turbot.log.warning("Foo 3", { data: "bar", key: "value2" });
  turbot.log.warning("Foo 4", { data: "bar", password: "value2" });

  turbot.sensitiveExceptions = ["key", "password"];
  turbot.log.warning("Foo 5", { data: "bar", password: "myPassword" });
  turbot.log.warning("Auto hide $ fields", { data: "bar", $hidden: "myPassword" });

  const tests = [
    { message: "Foo 3", expected: { key: "key", value: "value2" } },
    { message: "Foo 1", expected: { key: "data", value: "bar" } },
    { message: "Foo 2", expected: { key: "key", value: "<sensitive>" } },
    { message: "Foo 4", expected: { key: "password", value: "<sensitive>" } },
    { message: "Foo 5", expected: { key: "password", value: "myPassword" } },
    { message: "Auto hide $ fields", expected: { key: "$hidden", value: "<sensitive>" } },
  ];

  turbot.cargoContainer.logEntries.map((l) => {
    it(`test for: ${l.message}`, () => {
      const test = tests.filter((t) => {
        return t.message === l.message;
      });

      if (test.length > 0) {
        assert.equal(test[0].message, l.message);
        assert.equal(l.data[test[0].expected.key], test[0].expected.value);
      }
    });
  });
});

describe("@turbot/sdk - notify", function () {
  it("notify", function () {
    const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345, controlId: 123456789012346 });
    turbot.notify("fal", "test", { my: "data" });
    const eventData = turbot.sendFinal();
    const command = eventData.payload.commands[0];
    // console.log("command", command);
  });
});
