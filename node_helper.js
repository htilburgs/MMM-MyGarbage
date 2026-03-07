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
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
    this.lastAlertDate = null;

    // Reset daily alerts at midnight
    const now = moment();
    const tomorrow = moment().add(1, "days").startOf("day");
    setTimeout(() => {
      this.lastAlertDate = null;
      setInterval(() => this.lastAlertDate = null, 24*60*60*1000);
    }, tomorrow.diff(now));
  },

  socketNotificationReceived: async function(notification, payload) {

    if (notification === "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
      this.debug = this.config.debug || false;
      if (this.debug) console.log("[MyGarbage] Config received:", this.config);
    }

    if (notification === "MMM-MYGARBAGE-GET") {
      if (payload.dataSource === "ical") await this.loadICal(payload);
      else this.loadCSV(payload);
    }
  },

  loadCSV(payload) {
    if (this.schedule.length !== 0) {
      this.sendNextPickups(payload);
      return;
    }

    if (this.debug) console.log("[MyGarbage] Loading CSV file:", this.garbageScheduleCSVFile);

    fs.readFile(this.garbageScheduleCSVFile, "utf8", (err, rawData) => {
      if (err) { console.error("[MyGarbage] CSV read error:", err); return; }

      parse(rawData, { columns: true, delimiter: ",", ltrim: true }, (err, data) => {
        if (err) { console.error("[MyGarbage] CSV parse error:", err); return; }

        this.schedule = data;
        this.processCSV();

        if (this.debug) {
          console.log("[MyGarbage] CSV Loaded. Total entries:", this.schedule.length);
          this.schedule.forEach(p => {
            const dateStr = p.pickupDate.isValid() ? p.pickupDate.format("YYYY-MM-DD") : String(p.pickupDate);
            console.log(`[MyGarbage] CSV Pickup: ${dateStr} -> ${p.bins.join(", ")}`);
          });
        }

        this.sendNextPickups(payload);
      });
    });
  },

  processCSV() {
    const keys = Object.keys(this.schedule[0]);
    const bins = keys.filter(k => k !== "pickupDate" && k !== "WeekStarting");

    this.schedule = this.schedule.map(row => {
      const pickupDate = row.pickupDate
        ? moment(row.pickupDate)
        : moment(row.WeekStarting, ["YYYY-MM-DD", "MM/DD/YY"]);
      const activeBins = [];
      bins.forEach(bin => { if (row[bin]!=="0" && row[bin]!=="") activeBins.push(bin); });
      return { pickupDate, bins: activeBins };
    });
  },

  async loadICal(payload) {
    try {
      if (this.debug) console.log("[MyGarbage] Loading iCal from:", payload.icalUrl);

      const res = await axios.get(payload.icalUrl);
      const events = ical.parseICS(res.data);
      const map = payload.icalBinMap || {};
      this.schedule = [];

      const start = moment().startOf("day");
      const end = moment().add(payload.weeksToDisplay*7,"days");

      for (const key in events) {
        const ev = events[key];
        if (ev.type !== "VEVENT") continue;

        let occurrences = [];
        if (ev.rrule) occurrences = ev.rrule.between(start.toDate(), end.toDate(), true);
        else if (ev.start) occurrences = [ev.start];

        occurrences.forEach(date => {
          const pickupDate = moment(date);
          const eventName = (ev.summary||"").toLowerCase();

          let bin = null;
          Object.keys(map).forEach(name => { if (name.toLowerCase()===eventName) bin=map[name]; });
          if (!bin) bin="OtherBin";

          let existing = this.schedule.find(p=>p.pickupDate.isSame(pickupDate,"day"));
          if (!existing) { existing={pickupDate,bins:[]}; this.schedule.push(existing); }
          if (!existing.bins.includes(bin)) existing.bins.push(bin);
        });
      }

      if (this.debug) {
        console.log("[MyGarbage] iCal processed. Total pickups:", this.schedule.length);
        this.schedule.forEach(p => {
          const dateStr = p.pickupDate.isValid() ? p.pickupDate.format("YYYY-MM-DD") : String(p.pickupDate);
          console.log(`[MyGarbage] iCal Pickup: ${dateStr} -> ${p.bins.join(", ")}`);
        });
      }

      this.sendNextPickups(payload);
    } catch(err) { console.error("[MyGarbage] iCal error:", err.message); }
  },

  sendNextPickups(payload) {
    const start = moment().startOf("day");
    const end = moment().add(payload.weeksToDisplay*7,"days");

    const nextPickups = this.schedule
      .filter(p=>p.pickupDate.isBetween(start,end,null,"[)"))
      .map(p=>({ pickupDate: p.pickupDate.toISOString(), bins: p.bins }))
      .sort((a,b)=>new Date(a.pickupDate)-new Date(b.pickupDate));

    // CSV alert
    if (payload.dataSource==="csv" && this.config.alert===true && typeof this.config.alertThreshold==="number") {
      const todayStr = moment().format("YYYY-MM-DD");
      const futurePickups = this.schedule.filter(p=>p.pickupDate.isSameOrAfter(moment().startOf("day")));

      if (futurePickups.length <= this.config.alertThreshold && this.lastAlertDate !== todayStr) {
        if (this.debug) console.log(`[MyGarbage] Low CSV entries: ${futurePickups.length} remaining (threshold: ${this.config.alertThreshold})`);
        this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES"+payload.instanceId, futurePickups.length);
        this.lastAlertDate = todayStr;
      } else if (this.debug) console.log("[MyGarbage] Alert already sent today, skipping.");
    }

    this.sendSocketNotification("MMM-MYGARBAGE-RESPONSE"+payload.instanceId, nextPickups);
  }

});
