const { Turbot } = require("../");
const _ = require("lodash");
const chai = require("chai");
const assert = chai.assert;

xdescribe("@turbot/inline", function () {
  this.timeout(30000);

  xit("Send test - not live", function () {
    const turbot = new Turbot({ snsArn: "sns:arn" });

    turbot.log.debug("foo", { content: "x" });
    turbot.log.warning("bar", { content: "x" });
    const processEvent = turbot.sendFinal();

    //console.log("process event", processEvent);

    assert.equal(processEvent.payload.log.length, 1);
    assert.equal(
      processEvent.payload.log[0].message,
      "bar",
      "foo is not recorded because it is debug and we are not live"
    );
    assert.isUndefined(processEvent.meta.live);
    assert.equal(processEvent.meta.messageSequence, 0);

    assert.equal(processEvent.type, "process.turbot.com:terminate");

    assert.equal(turbot.cargoContainer.logEntries.length, 0, "Log entries is now empty");
  });

  const sender = (content, opts) => {
    console.log("ping ...", { content, opts });
  };

  it("Send test - live", function (done) {
    const turbot = new Turbot({ live: true, snsArn: "sns:arn" }, { senderFunction: sender });

    turbot.log.debug("foo", { content: "x" });
    turbot.log.warning("bar", { content: "x" });

    turbot.resource.upsert("aka:foo", { title: "bar" }, { akas: [1234, "fo"] });

    _.delay(() => {
      turbot.stop();

      turbot.send(true);

      done();
    }, 8000);

    // assert.equal(processEvent.payload.log.length, 1);
    // assert.equal(
    //   processEvent.payload.log[0].message,
    //   "bar",
    //   "foo is not recorded because it is debug and we are not live"
    // );
    // assert.isUndefined(processEvent.meta.live);
    // assert.equal(processEvent.meta.messageSequence, 0);

    // assert.equal(turbot.cargoContainer.logEntries.length, 0, "Log entries is now empty");
  });
});
