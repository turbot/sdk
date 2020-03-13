const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk", function() {
  describe("policy", function() {
    it("setting upsert", function() {
      const turbot = new Turbot({ snsArn: "sns:arn", resourceId: 123456789012345 }, { type: "policy" });

      turbot.policy.setting.upsert("crap", { foo: "bar" });
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
    });

    it("ok", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, policyValueId: 123456789012346 },
        { type: "policy" }
      );
      turbot.policy.ok("crap", { foo: "bar" });
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
    });
  });

  describe("turbot policy value test", function() {
    let x = 10;
    const values = [
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
      0
    ];

    values.forEach(function(value) {
      it(`turbot.policy.ok returns ${JSON.stringify(value)}`, function(done) {
        const turbot = new Turbot(
          { snsArn: "sns:arn", resourceId: 123456789012345, policyValueId: 123456789012346 },
          { type: "policy" }
        );
        turbot.policy.ok(value, "reason");
        const msg = turbot.asProcessEvent();
        assert.lengthOf(msg.payload.commands, 1);
        assert.deepEqual(msg.payload.commands[0].variables.input.value, value);
        done();
      });
    });
  });

  // describe("turbot.ok failed test", function() {
  //   it("ok", function() {
  //     const turbot = new Turbot(
  //       { snsArn: "sns:arn", resourceId: 123456789012345, policyValueId: 123456789012346 },
  //       { type: "policy" }
  //     );
  //     const data = false;
  //     // turbot.policy.ok(data);
  //     turbot.ok(data);
  //     const msg = turbot.asProcessEvent();
  //     assert.lengthOf(msg.payload.commands, 1);
  //     const cmd = msg.payload.commands[0];
  //     console.log({ cmd });
  //     assert.deepEqual(msg.payload.commands[0].type, "policy_update");
  //     assert.deepEqual(msg.payload.commands[0].payload.value, data);
  //   });
  // });

  describe("turbot.ok true test", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { snsArn: "sns:arn", resourceId: 123456789012345, policyValueId: 123456789012346 },
        { type: "policy" }
      );
      const data = true;
      // turbot.policy.ok(data);
      turbot.ok(data);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      assert.deepEqual(msg.payload.commands[0].type, "graphql");
      assert.deepEqual(msg.payload.commands[0].variables.input.value, data);
    });
  });
});
