const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk", function() {
  describe("resource upsert", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { parentId: null,resourceTypeAka: "test",data: "test", turbotData: "foo"  },
        { type: "resource_upsert" }
      );
      turbot.resource.upsert(null ,1);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });
  });

  describe("resource update", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { resourceId: 123456789012345 ,data: "test", turbotData: "foo"  },
        { type: "update" }
      );
      turbot.resource.update("trdt");
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });
  });

  describe("resource ok", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { resourceId: 123456789012345 ,data: "test", turbotData: "foo"  },
        { type: "put" }
      );
      turbot.resource.put();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });
  });

  describe("resource delete", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { resourceId: 0 },
        { type: "put" }
      );
      turbot.resource.delete();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });
  });

  describe("resource putPaths", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { resourceId: 0 },
        { type: "putPaths" }
      );
      turbot.resource.putPaths("");
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });
  });

  describe("resource putPath", function() {
    it("ok", function() {
      const turbot = new Turbot(
        { resourceId: 0 },
        { type: "putPath" }
      );
      turbot.resource.putPath(123456789012345,12345);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });
  });
});