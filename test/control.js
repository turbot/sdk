const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk control test", function () {
  describe("base test", function () {
    it("ok", function () {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, controlValueId: 123456789012346 },
        { type: "control" }
      );
      turbot.ok();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
    });
  });

  describe("turbot control state test", function () {
    const states = ["ok", "invalid", "tbd", "invalid"];

    states.forEach(function (state) {
      it(`turbot.${state} returns ${state}`, function (done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, controlValueId: 123456789012346 },
          { type: "control" }
        );
        turbot[state]();
        const msg = turbot.asProcessEvent();
        assert.isArray(msg.payload.commands);
        assert.lengthOf(msg.payload.commands, 1);
        assert.lengthOf(msg.payload.commands, 1);
        assert.equal(msg.payload.commands[0].payload.state, state);
        done();
      });
    });
  });

  describe("turbot control value for ok state test", function () {
    let x = 10;
    const datas = [
      // "one"
      { foo: "bar" },
      [{ foo: "bar" }, { tom: "jerry" }],
      [[1, 2]],
      ["hello", "bye"],
      [-1, -2],
      [-1, 100000000000000000],
      true,
      [{ foo: "" }],
      [{ foo: null }],
      [true, false],
      x,
      [{ type: "aws", level: "admin" }],
      [{ type: "aws", level: "admin" }, [1, 2, 3]],
      [[1, 2, 3], { type: "aws", level: "admin" }],
    ];

    datas.forEach(function (data) {
      it(`turbot.control.ok returns ${JSON.stringify(data)}`, function (done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, controlValueId: 123456789012346 },
          { type: "control" }
        );
        turbot.ok(data);

        const msg = turbot.asProcessEvent();
        // console.log("msg.payload.commands", JSON.stringify(msg.payload.commands));
        assert.isArray(msg.payload.commands);
        assert.lengthOf(msg.payload.commands, 1);
        assert.equal(msg.payload.commands[0].payload.data, data);
        done();
      });
    });
  });

  describe("base test", function () {
    it("ok", function () {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, controlValueId: 123456789012346 },
        { type: "control" }
      );
      turbot.ok();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
    });
  });
});
