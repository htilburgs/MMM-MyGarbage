const NodeHelper = require("node_helper");
const fs = require("fs");
const parse = require("csv-parse");
const moment = require("moment");
const ical = require("node-ical");
const axios = require("axios"); // required for HTTP iCal fetching

module.exports = NodeHelper.create({

  start: function () {
    console.log("Starting node_helper for module: " + this.name);
    this.schedule = [];
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
  },

  socketNotificationReceived: async function (notification, payload) {
    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
    } else if (notification === "MMM-MYGARBAGE-GET") {
      if (payload.dataSource === "ical") {
        await this.loadICal(payload);
      } else {
        this.loadCSV(payload);
      }
    }
  },

  // --- CSV Loader ---
  loadCSV: function (payload) {
    if (this.schedule.length === 0) {
      fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {
        if (err) return console.error("CSV Read Error:", err);

        parse(rawData, { delimiter: ",", columns: true, ltrim: true }, (err, parsedData) => {
          if (err) return console.error("CSV Parse Error:", err);

          this.schedule = parsedData;
          this.postProcessCSV();
          this.sendNextPickups(payload);
        });
      });
    } else {
      this.sendNextPickups(payload);
    }
  },

  postProcessCSV: function () {
    this.schedule.forEach(obj => {
      for (let key in obj) {
        if (key === "WeekStarting" && !obj.pickupDate) {
          obj.pickupDate = moment(obj.WeekStarting, ["MM/DD/YY", "YYYY-MM-DD"]);
        } else if (key !== "WeekStarting" && key !== "pickupDate") {
          // Normalize bin names: remove spaces, lowercase
          const normalizedKey = key.replace(/\s+/g, "").toLowerCase();
          obj[normalizedKey] = obj[key] !== "0";
          if (normalizedKey !== key) delete obj[key]; // remove original key
        }
      }
    });
  },

  // --- iCal Loader ---
  loadICal: async function (payload) {
    try {
      let events;
      if (payload.icalUrl.startsWith("http")) {
        const res = await axios.get(payload.icalUrl);
        events = ical.parseICS(res.data);
      } else {
        events = ical.parseICS(fs.readFileSync(payload.icalUrl, "utf8"));
      }

      this.schedule = [];

      for (let k in events) {
        const ev = events[k];
        if (ev.type === "VEVENT") {
          const pickupDate = moment(ev.start);
          const pickup = { pickupDate };

          // Map event title to bins (comma-separated) and normalize
          const bins = ev.summary.split(",").map(b => b.trim().replace(/\s+/g, "").toLowerCase());
          bins.forEach(bin => {
            if (bin) pickup[bin] = true;
          });

          // Merge bins if same day already exists
          const existing = this.schedule.find(p => p.pickupDate.isSame(pickupDate, "day"));
          if (existing) Object.assign(existing, pickup);
          else this.schedule.push(pickup);
        }
      }

      this.sendNextPickups(payload);

    } catch (e) {
      console.error("iCal Load Error:", e);
    }
  },

  // --- Send pickups to frontend ---
  sendNextPickups: function (payload) {
    const start = moment().startOf("day");
    const end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");

    // Filter pickups within the display range
    const nextPickups = this.schedule.filter(obj =>
      obj.pickupDate.isSameOrAfter(start) && obj.pickupDate.isBefore(end)
    );

    // Send alert if configured
    if (this.config.alert && nextPickups.length <= this.config.alert) {
      this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES", nextPickups.length);
    }

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE" + payload.instanceId, nextPickups);
  }

});
