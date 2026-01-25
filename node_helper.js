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
          if (err) {
            console.error("Error reading CSV file:", err);
            return;
          }
          parse(rawData, { delimiter: ",", columns: true, ltrim: true }, (err, parsedData) => {
            if (err) {
              console.error("Error parsing CSV:", err);
              return;
            }
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
          // Accept multiple date formats
          obj.pickupDate = moment(obj.WeekStarting, ["MM/DD/YY", "YYYY-MM-DD"]);
        } else if (key !== "WeekStarting" && key !== "pickupDate") {
          obj[key] = obj[key] !== "0"; // Convert to boolean
        }
      }
    });
    console.log("Post-processed schedule rows:", this.schedule.length);
  },

  getNextPickups: function (payload) {
    const start = moment().startOf("day");
    const end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");

    // TEMP: Ignore collectionCalendar for debugging
    const nextPickups = this.schedule.filter(obj =>
      obj.pickupDate.isSameOrAfter(start) && obj.pickupDate.isBefore(end)
    );

    console.log("Next pickups to send:", nextPickups.length);

    if (nextPickups.length === 0) {
      console.warn("No pickups found in the CSV within the next", payload.weeksToDisplay, "weeks.");
    }

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE" + payload.instanceId, nextPickups);
  }

});
