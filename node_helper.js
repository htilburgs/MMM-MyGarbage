var NodeHelper = require("node_helper");
var fs = require('fs');
var parse = require("csv-parse");
var moment = require("moment");

module.exports = NodeHelper.create({

  start: function () {
    console.log("Starting node_helper for module: " + this.name);
    this.schedule = null;
    this.garbageScheduleCSVFile = this.path + "/garbage_schedule.csv";
  },

  socketNotificationReceived: function (notification, payload) {

    var self = this;
    if (notification == "MMM-MYGARBAGE-CONFIG") {
      this.config = payload;
    }
    else if (notification == "MMM-MYGARBAGE-GET") {

      if (this.schedule == null) {
        //Load and parse the data file; Set up variables.

        var scheduleFile = this.garbageScheduleCSVFile;

        fs.readFile(scheduleFile, "utf8", function (err, rawData) {
          if (err) throw err;
          parse(rawData, { delimiter: ",", columns: true, ltrim: true }, function (err, parsedData) {
            if (err) throw err;

            self.schedule = parsedData;
            self.postProcessSchedule();
            self.getNextPickups(payload);
          });
        });
      } else {
        this.getNextPickups(payload);
      }
    }
  },

  postProcessSchedule: function () {
    this.schedule.forEach(function (obj) {
      for (var key in obj) {
        //Convert date strings to moment.js Date objects
        if (key == "WeekStarting")
          obj.pickupDate = moment(obj.WeekStarting, "MM/DD/YY");
        //Reassign strings to booleans for particular waste type
        else if (key != "WeekStarting" && key != "pickupDate")
          obj[key] = obj[key] !== "0";
      }
    });
  },

  getNextPickups: function (payload) {
    var start = moment().startOf("day"); //today, 12:00 AM
    var end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");
    
    //If nextPickups has only this.config.alert entries left, send alert
    var remainingPickups = this.schedule.filter(function (obj) {
      return obj.Calendar == payload.collectionCalendar &&
        obj.pickupDate.isSameOrAfter(start);
    });

    if (this.config.alert && remainingPickups.length <= this.config.alert) {
      this.sendSocketNotification("MMM-MYGARBAGE-NOENTRIES", remainingPickups.length);
    }
    //find info for next pickup dates
    var nextPickups = this.schedule.filter(function (obj) {
      return obj.Calendar == payload.collectionCalendar &&
        obj.pickupDate.isSameOrAfter(start) &&
        obj.pickupDate.isBefore(end);
    });

    this.sendSocketNotification('MMM-MYGARBAGE-RESPONSE' + payload.instanceId, nextPickups);

  }

});
