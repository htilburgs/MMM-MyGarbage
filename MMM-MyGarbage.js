Module.register('MMM-MyGarbage', {

  defaults: {
    alert: false,
    weeksToDisplay: 2,
    limitTo: 99,
    dateFormat: "dddd D MMMM",
    fade: true,
    fadePoint: 0.25,        // Start fade at 1/4th of the list
    collectionCalendar: "default" // Add collectionCalendar config
  },

  getStyles: function () {
    return ["MMM-MyGarbage.css"];
  },

  getScripts: function () {
    return ["moment.js"];
  },

  getTranslations: function () {
    return {
      en: "translations/en.json",
      nl: "translations/nl.json",
      de: "translations/de.json",
      sv: "translations/sv.json"
    };
  },

  capFirst: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  start: function () {
    Log.info('Starting module: ' + this.name);
    this.nextPickups = [];
    this.timer = null;

    this.sendSocketNotification('MMM-MYGARBAGE-CONFIG', this.config);
    this.getPickups();
  },

  getPickups: function () {
    clearTimeout(this.timer);
    this.timer = null;

    this.sendSocketNotification("MMM-MYGARBAGE-GET", {
      weeksToDisplay: this.config.weeksToDisplay,
      instanceId: this.identifier,
      collectionCalendar: this.config.collectionCalendar
    });

    // Refresh every hour
    var self = this;
    this.timer = setTimeout(() => self.getPickups(), 60 * 60 * 1000);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MMM-MYGARBAGE-RESPONSE" + this.identifier && payload.length > 0) {
      this.nextPickups = payload;
      this.updateDom(1000);
    } else if (notification === "MMM-MYGARBAGE-NOENTRIES") {
      this.sendNotification("SHOW_ALERT", {
        title: this.translate("GARBAGEENTRIESLEFT", { entriesLeft: payload }),
        message: this.translate("REMEMBERADDINGPICKUPS"),
        imageFA: "recycle",
        timer: 3000
      });
    }
  },

  svgIconFactory: function (type) {
    const colors = {
      GreenBin: "#00A651",
      GarbageBin: "#787878",
      PaperBin: "#0059ff",
      PMDBin: "#ffff00",
      OtherBin: "#B87333"
    };
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttributeNS(null, "class", "garbage-icon");
    svg.setAttributeNS(null, "style", "fill: " + (colors[type] || type));

    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", this.file("garbage_icons.svg#bin"));
    svg.appendChild(use);
    return svg;
  },

  getDom: function () {
    var wrapper = document.createElement("div");

    if (this.nextPickups.length === 0) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    let startFade = 0;
    let fadeSteps = 0;
    if (this.config.fade && this.config.fadePoint > 0 && this.config.fadePoint < 1) {
      startFade = Math.min(this.nextPickups.length, this.config.limitTo) * this.config.fadePoint;
      fadeSteps = Math.min(this.nextPickups.length, this.config.limitTo) - startFade;
    }

    for (let i = 0; i < this.nextPickups.length && i < this.config.limitTo; i++) {
      const pickup = this.nextPickups[i];

      // Container
      let pickupContainer = document.createElement("div");
      pickupContainer.classList.add("garbage-container");

      // Date
      let dateContainer = document.createElement("span");
      dateContainer.classList.add("garbage-date");
      const today = moment().startOf("day");
      const pickUpDate = moment(pickup.pickupDate);

      if (today.isSame(pickUpDate)) {
        dateContainer.innerHTML = this.translate("TODAY");
      } else if (today.clone().add(1, "days").isSame(pickUpDate)) {
        dateContainer.innerHTML = this.translate("TOMORROW");
      } else if (today.clone().add(7, "days").isAfter(pickUpDate)) {
        dateContainer.innerHTML = this.capFirst(pickUpDate.format("dddd"));
      } else {
        dateContainer.innerHTML = this.capFirst(pickUpDate.format(this.config.dateFormat));
      }
      pickupContainer.appendChild(dateContainer);

      // Icons
      let iconContainer = document.createElement("span");
      iconContainer.classList.add("garbage-icon-container");
      for (let key in pickup) {
        if (key !== "pickupDate" && key !== "WeekStarting" && pickup[key]) {
          iconContainer.appendChild(this.svgIconFactory(key));
        }
      }
      pickupContainer.appendChild(iconContainer);

      // Fading
      if (i >= startFade && fadeSteps > 0) {
        const fade = 1 - ((i - startFade) / fadeSteps);
        pickupContainer.style.opacity = fade;
      }

      wrapper.appendChild(pickupContainer);
    }

    return wrapper;
  }

});
