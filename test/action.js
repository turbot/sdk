const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk action test", function() {
  describe("base test", function() {
    it("run", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, actionValueId: 123456789012346 },
        { type: "action" }
      );
      turbot.action.run();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
    });
  });

  describe("turbot action state test", function() {
    const states = ["run"];

    states.forEach(function(state) {
      it(`turbot.${state} returns ${state}`, function(done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, actionValueId: 123456789012346 },
          { type: "action" }
        );
        turbot.action[state]();
        const msg = turbot.asProcessEvent();
        // console.log(JSON.stringify(msg));
        assert.isArray(msg.payload.commands);
        assert.lengthOf(msg.payload.commands, 1);
        assert.equal(msg.payload.commands[0].type, "action_run");
        done();
      });
    });
  });

  describe("turbot action value for run state test", function() {
    let x = 10;
    const datas = [
      "one",
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
      [[1, 2, 3], { type: "aws", level: "admin" }]
    ];

    datas.forEach(function(data) {
      it(`turbot.action.run returns ${JSON.stringify(data)}`, function(done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, actionValueId: 123456789012346 },
          { type: "action" }
        );
        turbot.action.run(data);

        const msg = turbot.asProcessEvent();
        // console.log("msg.payload.commands", JSON.stringify(msg.payload.commands));
        assert.isArray(msg.payload.commands);
        assert.lengthOf(msg.payload.commands, 1);
        assert.equal(msg.payload.commands[0].type, "action_run");
        done();
      });
    });
  });

  describe("base test", function() {
    it("run", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, actionValueId: 123456789012346 },
        { type: "action" }
      );
      turbot.action.run();
      const msg = turbot.asProcessEvent();
      // console.log(JSON.stringify(msg));
      assert.lengthOf(msg.payload.commands, 1);
    });
  });
});
