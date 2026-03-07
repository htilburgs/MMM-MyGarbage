const NodeHelper = require("node_helper");
const fs = require("fs");
const moment = require("moment");
const { parse } = require("csv-parse");

module.exports = NodeHelper.create({

  start() {

    console.log("Starting node_helper for MMM-MyGarbage");

    this.schedule = [];
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
  },

  socketNotificationReceived(notification, payload) {

    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
      this.debug = this.config.debug || false;
    }

    if (notification === "MMM-MYGARBAGE-GET") {

      if (payload.dataSource === "csv") {
        this.loadCSV(payload);
      }
    }
  },

  loadCSV(payload) {

    if (this.schedule.length !== 0) {
      this.sendNextPickups(payload);
      return;
    }

    fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {

      if (err) {
        console.error("[MyGarbage] CSV read error:", err);
        return;
      }

      parse(rawData, { delimiter: ",", columns: true, ltrim: true }, (err, data) => {

        if (err) {
          console.error("[MyGarbage] CSV parse error:", err);
          return;
        }

        this.schedule = data;

        this.postProcessCSV();

        this.sendNextPickups(payload);
      });
    });
  },

  postProcessCSV() {

    if (this.schedule.length === 0) return;

    const keys = Object.keys(this.schedule[0]);

    this.detectedBins = keys.filter(
      k => k !== "pickupDate" && k !== "WeekStarting"
    );

    if (this.debug) {
      console.log("[MyGarbage] Detected bins:", this.detectedBins);
    }

    this.schedule = this.schedule.map(row => {

      const pickupDate = row.pickupDate
        ? moment(row.pickupDate)
        : moment(row.WeekStarting, ["MM/DD/YY", "YYYY-MM-DD"]);

      const bins = [];

      this.detectedBins.forEach(bin => {
        if (row[bin] !== "0" && row[bin] !== "") {
          bins.push(bin);
        }
      });

      return {
        pickupDate,
        bins
      };
    });
  },

  sendNextPickups(payload) {

    const start = moment().startOf("day");
    const end = moment().add(payload.weeksToDisplay * 7, "days");

    const nextPickups = this.schedule
      .filter(p => p.pickupDate.isBetween(start, end, null, "[)"))
      .map(p => ({
        pickupDate: p.pickupDate.toISOString(),
        bins: p.bins
      }))
      .sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

    if (this.debug) {
      console.log("[MyGarbage] Sending pickups:", nextPickups);
    }

    this.sendSocketNotification(
      "MMM-MYGARBAGE-RESPONSE" + payload.instanceId,
      nextPickups
    );
  }

});
