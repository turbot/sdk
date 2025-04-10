const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk log test", function () {
  describe("base test", function () {
    it("info", function () {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );
      turbot.log.info();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.log, 1);
    });
  });

  describe("turbot log level test", function () {
    const states = ["error", "warning", "notice", "info", "debug"];

    states.forEach(function (level) {
      it(`turbot.${level} returns ${level}`, function (done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
          { type: "log" }
        );
        turbot.log[level]();
        const msg = turbot.asProcessEvent();
        assert.isArray(msg.payload.log);
        assert.lengthOf(msg.payload.log, 1);
        assert.equal(msg.payload.log[0].level, level);
        done();
      });
    });
  });

  describe("turbot log level for info level test", function () {
    let x = 10;
    const reasons = [
      "one",
      { foo: "bar" },
      "one",
      [{ foo: "bar" }, { tom: "jerry" }],
      [[1, 2]],
      ["hello", "bye"],
      [-1, -2],
      [-1, 100000000000000000],
      true,
      false, //bug
      [{ foo: "" }],
      [{ foo: null }],
      [true, false],
      x,
      "",
      [{ type: "aws", level: "admin" }],
      [{ type: "aws", level: "admin" }, [1, 2, 3]],
      [[1, 2, 3], { type: "aws", level: "admin" }],
    ];

    reasons.forEach(function (reason) {
      it(`turbot.log.info returns ${JSON.stringify(reason)}`, function (done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
          { type: "log" }
        );
        turbot.log.info(reason);

        const msg = turbot.asProcessEvent();
        // console.log("msg.payload.log", JSON.stringify(msg.payload.log));
        done();
      });
    });
  });

  describe("log message formats", function() {
    it("should properly format log messages with string data", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      const message = "This is a test message";
      const data = "Simple string data";

      turbot.log.info(message, data);
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);
      assert.equal(msg.payload.log[0].level, "info");
      assert.equal(msg.payload.log[0].message, message);
      assert.deepEqual(msg.payload.log[0].data, { data: data });
    });

    it("should properly format log messages with object data", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      const message = "Object data test";
      const data = {
        stringProp: "value",
        numProp: 123,
        boolProp: true,
        nestedProp: {
          nested: "value"
        }
      };

      turbot.log.info(message, data);
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);
      assert.equal(msg.payload.log[0].level, "info");
      assert.equal(msg.payload.log[0].message, message);
      assert.deepEqual(msg.payload.log[0].data, data);
    });

    it("should handle undefined message", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      turbot.log.info(undefined, { data: "test" });
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);
      assert.equal(msg.payload.log[0].level, "info");
      assert.equal(msg.payload.log[0].message, "");
    });

    it("should handle undefined data", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      turbot.log.info("Message with undefined data");
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);
      assert.equal(msg.payload.log[0].level, "info");
      assert.equal(msg.payload.log[0].message, "Message with undefined data");
      assert.deepEqual(msg.payload.log[0].data, { data: undefined });
    });
  });

  describe("multiple log entries", function() {
    it("should accumulate multiple log entries", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      turbot.log.info("First log message");
      turbot.log.warning("Second log message");
      turbot.log.error("Third log message");

      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 3);

      assert.equal(msg.payload.log[0].level, "info");
      assert.equal(msg.payload.log[0].message, "First log message");

      assert.equal(msg.payload.log[1].level, "warning");
      assert.equal(msg.payload.log[1].message, "Second log message");

      assert.equal(msg.payload.log[2].level, "error");
      assert.equal(msg.payload.log[2].message, "Third log message");
    });

    it("should maintain correct order of log entries", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      // Add logs in different order of severity
      turbot.log.debug("Debug message");
      turbot.log.error("Error message");
      turbot.log.info("Info message");
      turbot.log.warning("Warning message");
      turbot.log.notice("Notice message");

      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 5);

      // Verify the entries are in the order they were added, not by severity
      assert.equal(msg.payload.log[0].level, "debug");
      assert.equal(msg.payload.log[0].message, "Debug message");

      assert.equal(msg.payload.log[1].level, "error");
      assert.equal(msg.payload.log[1].message, "Error message");

      assert.equal(msg.payload.log[2].level, "info");
      assert.equal(msg.payload.log[2].message, "Info message");

      assert.equal(msg.payload.log[3].level, "warning");
      assert.equal(msg.payload.log[3].message, "Warning message");

      assert.equal(msg.payload.log[4].level, "notice");
      assert.equal(msg.payload.log[4].message, "Notice message");
    });
  });

  describe("sensitive data handling", function() {
    it("should mask sensitive data with $ prefix", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      const sensitiveData = {
        username: "testuser",
        $password: "secret123",
        $apiKey: "api-key-123456",
        regularField: "not-sensitive"
      };

      turbot.log.info("Message with sensitive data", sensitiveData);
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);

      // Check that $ fields are masked
      assert.equal(msg.payload.log[0].data.username, "testuser");
      assert.equal(msg.payload.log[0].data.$password, "<sensitive>");
      assert.equal(msg.payload.log[0].data.$apiKey, "<sensitive>");
      assert.equal(msg.payload.log[0].data.regularField, "not-sensitive");
    });

    it("should handle sensitiveExceptions appropriately", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, logValueId: 123456789012346 },
        { type: "log" }
      );

      // Test with sensitiveExceptions - this test just verifies the method exists and doesn't throw errors
      turbot.sensitiveExceptions = ["apiKey", "credentials"];

      const data = {
        username: "testuser",
        apiKey: "api-key-123456",
        credentials: {
          username: "admin",
          password: "adminpass"
        },
        regularField: "not-sensitive"
      };

      turbot.log.info("Message with sensitive fields", data);
      const msg = turbot.asProcessEvent();

      assert.isArray(msg.payload.log);
      assert.lengthOf(msg.payload.log, 1);

      // Just check that all properties exist - don't make assumptions about masking
      assert.property(msg.payload.log[0].data, "username");
      assert.property(msg.payload.log[0].data, "apiKey");
      assert.property(msg.payload.log[0].data, "credentials");
      assert.property(msg.payload.log[0].data, "regularField");
    });
  });
});
