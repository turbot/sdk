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
});
