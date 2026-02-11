const NodeHelper = require("node_helper");
const fs = require("fs");
const moment = require("moment");
const axios = require("axios");
const ical = require("node-ical");
const { parse } = require("csv-parse"); 

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

      let rawData;

      if (payload.icalUrl.startsWith("http")) {
        // Fetch iCal from URL with redirects
        const res = await axios.get(payload.icalUrl, { maxRedirects: 5 });
        rawData = res.data;
      } else {
        // Load local file
        rawData = fs.readFileSync(payload.icalUrl, "utf8");
      }

      const events = ical.parseICS(rawData);
      this.schedule = [];
      const map = payload.icalBinMap || {};

      // Expand recurring events (RRULE) into concrete pickup dates within the display window.
      // Without this, a biweekly rule like Waste only yields the very first DTSTART instance.
      const windowStart = moment().startOf("day");
      const windowEnd = moment().startOf("day").add((payload.weeksToDisplay || 2) * 7, "days");

      const applyBinMapping = (ev, pickup) => {
        const eventName = (ev.summary || "").toLowerCase();
        let mapped = false;

        // Map using user-provided icalBinMap
        for (const key in map) {
          if (key.toLowerCase() === eventName) {
            pickup[map[key]] = true;
            mapped = true;
          }
        }

        // Unknown events automatically go to OtherBin
        if (!mapped) {
          pickup["OtherBin"] = true;
          if (this.debug) console.log(`[MyGarbage] Unknown pickup '${ev.summary}' mapped to OtherBin`);
        }
      };

      for (let k in events) {
        const ev = events[k];
        if (ev.type !== "VEVENT") continue;

        // Determine all occurrences in the window.
        // node-ical exposes `ev.rrule` (from rrule package) for recurring events.
        let occurrences = [];

        if (ev.rrule) {
          // Include occurrences that fall within the window.
          occurrences = ev.rrule.between(windowStart.toDate(), windowEnd.toDate(), true);

          // Respect EXDATE exclusions when present.
          if (ev.exdate) {
            const ex = Object.values(ev.exdate).map(d => moment(d).format("YYYY-MM-DD"));
            occurrences = occurrences.filter(d => !ex.includes(moment(d).format("YYYY-MM-DD")));
          }
        } else if (ev.start) {
          occurrences = [ev.start];
        }

        // Create / merge pickups for each occurrence.
        for (const occ of occurrences) {
          const pickupDate = moment(occ);
          const pickup = { pickupDate };

          applyBinMapping(ev, pickup);

          // Merge multiple bins on the same day
          const existing = this.schedule.find(p => p.pickupDate.isSame(pickupDate, "day"));
          if (existing) Object.assign(existing, pickup);
          else this.schedule.push(pickup);
        }
      }

      if (this.debug) console.log("[MyGarbage] iCal loaded. Total pickups:", this.schedule.length);
      this.sendNextPickups(payload);

    } catch (err) {
      console.error("[MyGarbage] Failed to load iCal:", payload.icalUrl);
      console.error(err.message || err);
    }
  },

  // --- Normalize pickup bins ---
  normalizePickupBins: function(pickup) {
    const standardBins = ["GreenBin","PaperBin","GarbageBin","PMDBin","OtherBin"];
    const normalized = {
      // Serialize to ISO string so the frontend can reliably parse and sort.
      pickupDate: moment.isMoment(pickup.pickupDate)
        ? pickup.pickupDate.toISOString()
        : moment(pickup.pickupDate).toISOString()
    };

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
      .map(p => this.normalizePickupBins(p))
      .sort((a, b) => new Date(a.pickupDate).getTime() - new Date(b.pickupDate).getTime());

    if (this.debug) console.log("[MyGarbage] Next pickups to send:", nextPickups);

    if (this.config.alert && nextPickups.length <= this.config.alert) {
      this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES", nextPickups.length);
    }

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE" + payload.instanceId, nextPickups);
  }

});
