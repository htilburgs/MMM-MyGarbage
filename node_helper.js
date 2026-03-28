const NodeHelper = require("node_helper");
const fs = require("fs");
const moment = require("moment");
const axios = require("axios");
const ical = require("node-ical");
const { parse } = require("csv-parse");

module.exports = NodeHelper.create({

  start() {
    console.log("Starting node_helper for MMM-MyGarbage");

    this.schedule = [];
    this.lastLoad = null;
    this.lastAlertDate = null;
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";

    // Reset alert daily at midnight
    const now = moment();
    const tomorrow = moment().add(1, "day").startOf("day");
    setTimeout(() => {
      this.lastAlertDate = null;
      setInterval(() => this.lastAlertDate = null, 24 * 60 * 60 * 1000);
    }, tomorrow.diff(now));
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
      this.debug = this.config.debug || false;
      if (this.debug) console.log("[MyGarbage] Config received:", this.config);
    }

    if (notification === "MMM-MYGARBAGE-GET") {
      // Use cache if within 60 minutes
      if (this.schedule.length && this.lastLoad && moment().diff(this.lastLoad, "minutes") < 60) {
        if (this.debug) console.log("[MyGarbage] Using cached data");
        return this.sendNextPickups(payload);
      }

      if (payload.dataSource === "ical") this.loadICal(payload);
      else this.loadCSV(payload);
    }
  },

  /* ---------------------------
     CSV LOADING (STRICT + ISO)
  ---------------------------- */
  loadCSV(payload) {
    fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {
      if (err) return this.sendError(payload, "CSV read error!");

      parse(rawData, { columns: true, delimiter: ",", ltrim: true }, (err, data) => {
        if (err) return this.sendError(payload, "CSV wrong format!");

        const validBins = Object.keys(this.config.binColors);

        this.schedule = data.map(row => {
          const date = row.pickupDate
            ? moment(row.pickupDate)
            : moment(row.WeekStarting, ["YYYY-MM-DD", "MM/DD/YY"]);

          return {
            pickupDate: date.toISOString(), // always ISO
            bins: validBins.filter(bin => row[bin] && row[bin] !== "0") // only known bins
          };
        });

        this.afterLoad(payload, "CSV");
      });
    });
  },

  /* ---------------------------
     ICAL LOADING (ISO + CLEAN)
  ---------------------------- */
  async loadICal(payload) {
    try {
      if (this.debug) console.log("[MyGarbage] Loading iCal:", payload.icalUrl);

      const res = await axios.get(payload.icalUrl);
      const events = ical.parseICS(res.data);

      const start = moment().startOf("day"); // today
      const end = start.clone().add(payload.weeksToDisplay * 7, "days"); // future N weeks

      const validBins = Object.keys(this.config.binColors);
      const scheduleMap = new Map(); // key = ISO date

      for (const key in events) {
        const ev = events[key];
        if (ev.type !== "VEVENT") continue;

        const occurrences = ev.rrule
          ? ev.rrule.between(start.toDate(), end.toDate(), true)
          : (ev.start ? [ev.start] : []);

        occurrences.forEach(date => {
          const mDate = moment(date);
          const iso = mDate.toISOString();
          const eventName = (ev.summary || "").toLowerCase();

          if (!scheduleMap.has(iso)) {
            scheduleMap.set(iso, { pickupDate: iso, bins: [] });
          }

          const entry = scheduleMap.get(iso);

          validBins.forEach(bin => {
            if (eventName.includes(bin.toLowerCase())) {
              if (!entry.bins.includes(bin)) entry.bins.push(bin);
            }
          });

          // fallback if no bins matched
          if (entry.bins.length === 0) {
            entry.bins.push("OtherBin");
          }
        });
      }

      this.schedule = Array.from(scheduleMap.values());
      this.afterLoad(payload, "iCal");

    } catch (err) {
      console.error("[MyGarbage] iCal error:", err.message);
      this.sendError(payload, "iCal load error!");
    }
  },

  /* ---------------------------
     COMMON POST-LOAD HANDLER
  ---------------------------- */
  afterLoad(payload, source) {
    this.lastLoad = moment();

    if (this.debug) {
      console.log(`[MyGarbage] ${source} loaded. Total pickups: ${this.schedule.length}`);
      this.schedule
        .slice()
        .sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate))
        .forEach(p => console.log(`[MyGarbage] ${p.pickupDate} -> ${p.bins.join(", ")}`));
    }

    this.sendNextPickups(payload);
  },

  /* ---------------------------
     SEND DATA TO FRONTEND
     (future-only + rolling N weeks)
  ---------------------------- */
  sendNextPickups(payload) {
    const today = moment().startOf("day"); // today
    const end = today.clone().add(payload.weeksToDisplay * 7, "days"); // N weeks ahead

    const nextPickups = this.schedule
      .filter(p => {
        const d = moment(p.pickupDate);
        return d.isSameOrAfter(today) && d.isBefore(end); // only future pickups
      })
      .sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

    this.checkCSVThreshold(payload);

    this.sendSocketNotification(
      "MMM-MYGARBAGE-RESPONSE" + payload.instanceId,
      nextPickups
    );
  },

  /* ---------------------------
     CSV ALERT HANDLING
  ---------------------------- */
  checkCSVThreshold(payload) {
    if (
      payload.dataSource !== "csv" ||
      !this.config.alert ||
      typeof this.config.alertThreshold !== "number"
    ) return;

    const todayStr = moment().format("YYYY-MM-DD");

    const future = this.schedule.filter(p =>
      moment(p.pickupDate).isSameOrAfter(moment().startOf("day"))
    );

    if (future.length <= this.config.alertThreshold && this.lastAlertDate !== todayStr) {
      if (this.debug) {
        console.log(`[MyGarbage] Low CSV entries: ${future.length}`);
      }

      this.sendSocketNotification(
        "MMM-MYGARBAGE-NOENTRIES" + payload.instanceId,
        future.length
      );

      this.lastAlertDate = todayStr;
    }
  },

  /* ---------------------------
     ERROR HANDLER
  ---------------------------- */
  sendError(payload, message) {
    this.sendSocketNotification(
      "MMM-MYGARBAGE-ERROR" + payload.instanceId,
      message
    );
  }

});
