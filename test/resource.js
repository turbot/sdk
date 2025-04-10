const { Turbot } = require("../");
const chai = require("chai");
const assert = chai.assert;

describe("@turbot/sdk", function () {
  describe("resource upsert", function () {
    it("ok", function () {
      const turbot = new Turbot(
        { parentId: null, resourceTypeAka: "test", data: "test", turbotData: "foo" },
        { type: "resource_upsert" }
      );
      turbot.resource.upsert(null, 1);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });

    it("upsert with complex data", function () {
      const complexData = {
        name: "Test Resource",
        properties: {
          tags: ["tag1", "tag2"],
          active: true,
          metadata: {
            created: "2022-01-01",
            owner: "test@example.com"
          }
        }
      };

      const turbot = new Turbot(
        { parentId: "parent123", resourceTypeAka: "complex:test", data: complexData, turbotData: "metadata" },
        { type: "resource_upsert" }
      );

      turbot.resource.upsert("aka:complex-resource", complexData);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "graphql");
    });

    it("upsert with akas array", function () {
      const turbot = new Turbot(
        { parentId: "parent456", resourceTypeAka: "test:multi-aka", data: { name: "Multi AKA Resource" } },
        { type: "resource_upsert" }
      );

      const akas = ["primary:aka", "secondary:aka", "tertiary:aka"];
      turbot.resource.upsert("primary:aka", { name: "Multi AKA Resource" }, { akas: akas });

      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "graphql");
    });
  });

  describe("resource update", function () {
    it("ok", function () {
      const turbot = new Turbot({ resourceId: 123456789012345, data: "test", turbotData: "foo" }, { type: "update" });
      turbot.resource.update("trdt");
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });

    it("update with partial data", function () {
      const turbot = new Turbot({ resourceId: 123456789012345 }, { type: "update" });

      const partialData = {
        status: "active",
        lastUpdated: "2022-03-15"
      };

      turbot.resource.update(partialData);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "graphql");
      assert.equal(cmd.variables.input.id, 123456789012345);
      assert.deepEqual(cmd.variables.input.data, partialData);
    });
  });

  describe("resource ok", function () {
    it("ok", function () {
      const turbot = new Turbot({ resourceId: 123456789012345, data: "test", turbotData: "foo" }, { type: "put" });
      turbot.resource.put();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });

    it("put with data override", function () {
      const turbot = new Turbot({ resourceId: 123456789012345, data: "original" }, { type: "put" });

      const newData = {
        name: "Updated Name",
        description: "This is an updated description"
      };

      turbot.resource.put(newData);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "graphql");
      assert.equal(cmd.variables.input.id, 123456789012345);
      assert.deepEqual(cmd.variables.input.data, newData);
    });
  });

  describe("resource delete", function () {
    it("ok", function () {
      const turbot = new Turbot({ resourceId: 0 }, { type: "put" });
      turbot.resource.delete();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
      // console.log({ cmd });
    });

    it("delete with specific resourceId", function () {
      const specificResourceId = 987654321098765;
      const turbot = new Turbot({ resourceId: specificResourceId }, { type: "put" });

      turbot.resource.delete();
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "resource_delete");
    });

    it("delete with aka", function () {
      const turbot = new Turbot({ resourceId: 123456789012345 }, { type: "put" });

      const akaToDelete = "custom:resource:identifier";
      turbot.resource.delete(akaToDelete);

      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "resource_delete");
    });
  });

  describe("resource putPaths", function () {
    it("ok", function () {
      const turbot = new Turbot({ resourceId: 0 }, { type: "putPaths" });
      turbot.resource.putPaths("");
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });

    it("putPaths with multiple paths", function () {
      const resourceId = 123456789012345;
      const turbot = new Turbot({ resourceId: resourceId }, { type: "putPaths" });

      const paths = [
        { key: "tags.environment", value: "production" },
        { key: "tags.owner", value: "securityteam" },
        { key: "metadata.lastScanned", value: "2022-03-15T14:30:00Z" }
      ];

      turbot.resource.putPaths(paths);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];

      assert.equal(cmd.type, "graphql");
    });
  });

  describe("resource putPath", function () {
    it("ok", function () {
      const turbot = new Turbot({ resourceId: 0 }, { type: "putPath" });
      turbot.resource.putPath(123456789012345, 12345);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });

    it("putPath with string value", function () {
      const resourceId = 123456789012345;
      const turbot = new Turbot({ resourceId: resourceId }, { type: "putPath" });

      const key = "metadata.securityLevel";
      const value = "high";

      turbot.resource.putPath(key, value);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });

    it("putPath with complex object value", function () {
      const resourceId = 123456789012345;
      const turbot = new Turbot({ resourceId: resourceId }, { type: "putPath" });

      const key = "configuration";
      const value = {
        enabled: true,
        options: {
          retention: 30,
          encryption: "AES-256"
        }
      };

      turbot.resource.putPath(key, value);
      const msg = turbot.asProcessEvent();
      assert.lengthOf(msg.payload.commands, 1);
      const cmd = msg.payload.commands[0];
    });
  });
});
