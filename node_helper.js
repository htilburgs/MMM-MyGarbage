const NodeHelper = require("node_helper");
const fs = require("fs");
const parse = require("csv-parse");
const moment = require("moment");
const ical = require("node-ical");
const axios = require("axios");

module.exports = NodeHelper.create({

  start: function () {
    console.log("Starting node_helper for module: " + this.name);
    this.schedule = [];
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
  },

  socketNotificationReceived: async function(notification, payload) {
    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
      this.debug = this.config.debug || false;
      if (this.debug) console.log("[MyGarbage] Config received:", this.config);
    } else if (notification === "MMM-MYGARBAGE-GET") {
      if (payload.dataSource === "ical") {
        await this.loadICal(payload);
      } else {
        this.loadCSV(payload);
      }
    }
  },

  // --- CSV Loader ---
  loadCSV: function(payload) {
    if (this.schedule.length === 0) {
      if (this.debug) console.log("[MyGarbage] Loading CSV file:", this.garbageScheduleCSVFile);
      fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {
        if (err) return console.error("[MyGarbage] CSV Read Error:", err);

        parse(rawData, { delimiter: ",", columns: true, ltrim: true }, (err, parsedData) => {
          if (err) return console.error("[MyGarbage] CSV Parse Error:", err);

          this.schedule = parsedData;
          this.postProcessCSV();
          if (this.debug) console.log("[MyGarbage] CSV Loaded. Total entries:", this.schedule.length);
          this.sendNextPickups(payload);
        });
      });
    } else {
      this.sendNextPickups(payload);
    }
  },

  postProcessCSV: function() {
    this.schedule.forEach(obj => {
      if (!obj.pickupDate && obj.WeekStarting) {
        obj.pickupDate = moment(obj.WeekStarting, ["MM/DD/YY","YYYY-MM-DD"]);
      }
      for (let key in obj) {
        if (key !== "pickupDate" && key !== "WeekStarting") {
          obj[key] = obj[key] !== "0";
        }
      }
    });
  },

  // --- iCal Loader ---
  loadICal: async function(payload) {
    try {
      if (this.debug) console.log("[MyGarbage] Loading iCal URL:", payload.icalUrl);
      let events;
      if (payload.icalUrl.startsWith("http")) {
        const res = await axios.get(payload.icalUrl);
        events = ical.parseICS(res.data);
      } else {
        events = ical.parseICS(fs.readFileSync(payload.icalUrl, "utf8"));
      }

      this.schedule = [];
      const map = payload.icalBinMap || {};

      for (let k in events) {
        const ev = events[k];
        if (ev.type === "VEVENT") {
          const pickupDate = moment(ev.start);
          const pickup = { pickupDate };

          const eventName = ev.summary.toLowerCase();
          for (const key in map) {
            if (key.toLowerCase() === eventName) {
              pickup[map[key]] = true; // map to standard bin key
            }
          }

          // merge multiple bins on same day
          const existing = this.schedule.find(p => p.pickupDate.isSame(pickupDate, "day"));
          if (existing) Object.assign(existing, pickup);
          else this.schedule.push(pickup);
        }
      }

      if (this.debug) console.log("[MyGarbage] iCal loaded. Total pickups:", this.schedule.length);
      this.sendNextPickups(payload);

    } catch (e) {
      console.error("[MyGarbage] iCal Load Error:", e);
    }
  },

  // --- Normalize pickup keys ---
  normalizePickupBins: function(pickup, binMap) {
    const standardBins = ["GreenBin","PaperBin","GarbageBin","PMDBin","OtherBin"];
    const normalized = { pickupDate: pickup.pickupDate };

    standardBins.forEach(bin => {
      if (pickup[bin]) normalized[bin] = true;
    });

    return normalized;
  },

  // --- Send pickups to frontend ---
  sendNextPickups: function(payload) {
    const start = moment().startOf("day");
    const end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");

    let nextPickups = this.schedule
      .filter(obj => obj.pickupDate.isSameOrAfter(start) && obj.pickupDate.isBefore(end))
      .map(p => this.normalizePickupBins(p, payload.icalBinMap))
      .sort((a,b) => a.pickupDate - b.pickupDate);

    if (this.debug) console.log("[MyGarbage] Next pickups to send:", nextPickups);

    if (this.config.alert && nextPickups.length <= this.config.alert) {
      this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES", nextPickups.length);
    }

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE" + payload.instanceId, nextPickups);
  }

});
