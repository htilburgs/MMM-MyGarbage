const NodeHelper = require("node_helper");
const fs = require("fs");
const parse = require("csv-parse");
const moment = require("moment");

module.exports = NodeHelper.create({

  start: function () {
    console.log("Starting node_helper for module: " + this.name);
    this.schedule = null;
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
    } else if (notification === "MMM-MYGARBAGE-GET") {
      if (!this.schedule) {
        fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {
          if (err) throw err;
          parse(rawData, { delimiter: ",", columns: true, ltrim: true }, (err, parsedData) => {
            if (err) throw err;
            this.schedule = parsedData;
            this.postProcessSchedule();
            this.getNextPickups(payload);
          });
        });
      } else {
        this.getNextPickups(payload);
      }
    }
  },

  postProcessSchedule: function () {
    this.schedule.forEach(obj => {
      for (let key in obj) {
        if (key === "WeekStarting" && !obj.pickupDate) {
          obj.pickupDate = moment(obj.WeekStarting, "MM/DD/YY");
        } else if (key !== "WeekStarting" && key !== "pickupDate") {
          obj[key] = obj[key] !== "0";
        }
      }
    });
  },

  getNextPickups: function (payload) {
    const start = moment().startOf("day");
    const end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");

    // Remaining pickups for alert
    const remainingPickups = this.schedule.filter(obj =>
      obj.Calendar === payload.collectionCalendar &&
      obj.pickupDate.isSameOrAfter(start)
    );

    if (this.config.alert && remainingPickups.length <= this.config.alert) {
      this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES", remainingPickups.length);
    }

    // Next pickups in date range
    const nextPickups = this.schedule.filter(obj =>
      obj.Calendar === payload.collectionCalendar &&
      obj.pickupDate.isSameOrAfter(start) &&
      obj.pickupDate.isBefore(end)
    );

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE" + payload.instanceId, nextPickups);
  }

});
