// Syslog levels are always specifically defined by the application. Turbot's
// definitions are heavily inspired by:
//   https://support.solarwinds.com/Success_Center/Log_Event_Manager_(LEM)/Syslog_Severity_levels
//   http://pubs.opengroup.org/onlinepubs/009695399/functions/syslog.html
//   https://en.wikipedia.org/wiki/Syslog#Severity_level
module.exports = {
  emergency: {
    value: 0,
    name: "emergency",
    aliases: ["emerg"],
    severity: "Emergency",
    description: "Turbot is unavailable and automatic recovery is unlikely."
  },

  alert: {
    value: 1,
    id: "alert",
    severity: "Alert",
    description: "Alert from a key component or dependency. Turbot is unusable, but may automatically recover."
  },

  critical: {
    value: 2,
    id: "critical",
    aliases: ["crit"],
    severity: "Critical",
    description: "Critical conditions. Turbot may be unavailable or have severely degraded performance."
  },

  error: {
    value: 3,
    id: "error",
    aliases: ["err"],
    severity: "Error",
    description: "Error significant to an action, but not critical to Turbot. Review and remediation required."
  },

  warning: {
    value: 4,
    id: "warning",
    severity: "Warning",
    description: "Warning messages. An error may occur if action is not taken. Review recommended."
  },

  notice: {
    value: 5,
    id: "notice",
    severity: "Notice",
    description: "Significant, but normal, events such as automated actions."
  },

  info: {
    value: 6,
    id: "info",
    severity: "Informational",
    description: "Information about decisions and interim data."
  },

  debug: {
    value: 7,
    id: "debug",
    severity: "Debug",
    description: "Debug messages used in development only."
  }
};
