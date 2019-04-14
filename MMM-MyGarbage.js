Module.register('MMM-MyGarbage', {

  // Default values
  defaults: {
    alert: false,
    weeksToDisplay: 2,
    limitTo: 99,
    dateFormat: "dddd D MMMM",
    fade: true,
    fadePoint: 0.25     // Start on 1/4th of the list.
  },

  // Define stylesheet
  getStyles: function () {
    return ["MMM-MyGarbage.css"];
  },

  // Define required scripts.
  getScripts: function () {
    return ["moment.js"];
  },

  // Define required translations.
  getTranslations: function () {
    return {
      en: "translations/en.json",
      nl: "translations/nl.json",
      de: "translations/de.json"
    }
  },

  capFirst: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  start: function () {
    Log.info('Starting module: ' + this.name);
    this.sendSocketNotification('MMM-MYGARBAGE-CONFIG', this.config);
    this.nextPickups = [];
    this.getPickups();
    this.timer = null;
  },

  // Read garbage_schedule.csv file
  getPickups: function () {
    clearTimeout(this.timer);
    this.timer = null;
    this.sendSocketNotification("MMM-MYGARBAGE-GET", { weeksToDisplay: this.config.weeksToDisplay, instanceId: this.identifier });

    //Set check times
    var self = this;
    this.timer = setTimeout(function () {
      self.getPickups();
    }, 60 * 60 * 1000); //update once an hour
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification == "MMM-MYGARBAGE-RESPONSE" + this.identifier && payload.length > 0) {
      this.nextPickups = payload;
      this.updateDom(1000);
    } else if (notification == "MMM-MYGARBAGE-NOENTRIES") { //Pass Alert on
      this.sendNotification("SHOW_ALERT", {
        title: this.translate("GARBAGEENTRIESLEFT", { entriesLeft: payload }),
        message: this.translate("REMEMBERADDINGPICKUPS"),
        imageFA: "recycle",
        timer: "3000"
      });
    }
  },

  // Create Garbage Icons from garbage_icons.svg
  svgIconFactory: function (color) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttributeNS(null, "class", "garbage-icon");
    //Switch for Legacy files
    switch (color) {
      case 'GreenBin':
        svg.setAttributeNS(null, "style", "fill: #00A651");
        break;
      case 'GarbageBin':
        svg.setAttributeNS(null, "style", "fill: #787878");
        break;
      case 'PaperBin':
        svg.setAttributeNS(null, "style", "fill: #0059ff");
        break;
      default:
        svg.setAttributeNS(null, "style", "fill: " + color);
        break;
    }
    var use = document.createElementNS('http://www.w3.org/2000/svg', "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", this.file("garbage_icons.svg#bin"));
    svg.appendChild(use);
    return (svg);
  },

  getDom: function () {
    var wrapper = document.createElement("div");

    if (this.nextPickups.length == 0) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    // Start Fade effect
    if (this.config.fade && this.config.fadePoint < 1) {
      if (this.config.fadePoint < 0) {
        this.config.fadePoint = 0;
      }
      var startFade = Math.min(this.nextPickups.length, this.config.limitTo) * this.config.fadePoint;
      var fadeSteps = Math.min(this.nextPickups.length, this.config.limitTo) - startFade;
    }
    var currentFadeStep = 0;
    // End Fade effect

    // this.nextPickups.forEach( function(pickup) {
    for (i = 0; i < this.nextPickups.length; i++) {
      if (i == this.config.limitTo) {
        break;
      }

      var pickup = this.nextPickups[i];

      //Create CSS Elements
      var pickupContainer = document.createElement("div");
      pickupContainer.classList.add("garbage-container");

      //Add date to Garbage Pickup
      var dateContainer = document.createElement("span");
      dateContainer.classList.add("garbage-date");

      //Formats Garbage Pickup Date
      moment.locale();
      var today = moment().startOf("day");
      var pickUpDate = moment(pickup.pickupDate);
      if (today.isSame(pickUpDate)) {
        dateContainer.innerHTML = this.translate("TODAY");
      } else if (moment(today).add(1, "days").isSame(pickUpDate)) {
        dateContainer.innerHTML = this.translate("TOMORROW");
      } else if (moment(today).add(7, "days").isAfter(pickUpDate)) {
        dateContainer.innerHTML = this.capFirst(pickUpDate.format("dddd"));
      } else {
        dateContainer.innerHTML = this.capFirst(pickUpDate.format(this.config.dateFormat));
      }

      pickupContainer.appendChild(dateContainer);

      //Add Garbage icons
      var iconContainer = document.createElement("span");
      iconContainer.classList.add("garbage-icon-container");
      for (var key in pickup) {
        //Convert date strings to moment.js Date objects
        if (key != "pickupDate" && key != "WeekStarting")
          if (pickup[key])
            iconContainer.appendChild(this.svgIconFactory(key)); //TODO COLORS
      }

      pickupContainer.appendChild(iconContainer);
      wrapper.appendChild(pickupContainer);

      // Start Fading
      if (i >= startFade) {	//fading
        currentFadeStep = i - startFade;
        pickupContainer.style.opacity = 1 - (1 / fadeSteps * currentFadeStep);
      }
      // End Fading

    };

    return wrapper;
  }

});
