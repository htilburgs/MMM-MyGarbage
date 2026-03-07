Module.register("MMM-MyGarbage", {

  defaults: {
    weeksToDisplay: 2,
    limitTo: 99,
    dateFormat: "dddd D MMMM",
    fade: true,
    fadePoint: 0.25,
    collectionCalendar: "default",
    dataSource: "csv",
    icalUrl: "",
    debug: false,

    binColors: {}
  },

  getStyles() {
    return ["MMM-MyGarbage.css"];
  },

  getScripts() {
    return ["moment.js"];
  },

  getTranslations() {
    return {
      en: "translations/en.json",
      nl: "translations/nl.json",
      de: "translations/de.json",
      fr: "translations/fr.json",
      sv: "translations/sv.json"
    };
  },

  start() {
    Log.info("Starting module: " + this.name);

    this.nextPickups = [];
    this.timer = null;

    this.sendSocketNotification("MMM-MYGARBAGE-CONFIG", this.config);

    this.getPickups();
  },

  getPickups() {
    clearTimeout(this.timer);

    this.sendSocketNotification("MMM-MYGARBAGE-GET", {
      weeksToDisplay: this.config.weeksToDisplay,
      instanceId: this.identifier,
      collectionCalendar: this.config.collectionCalendar,
      dataSource: this.config.dataSource,
      icalUrl: this.config.icalUrl
    });

    this.timer = setTimeout(() => {
      this.getPickups();
    }, 60 * 60 * 1000);
  },

  socketNotificationReceived(notification, payload) {

    if (notification === "MMM-MYGARBAGE-RESPONSE" + this.identifier) {

      this.nextPickups = payload
        .slice()
        .sort((a, b) => new Date(a.pickupDate) - new Date(b.pickupDate));

      if (this.config.debug) {
        Log.info("[MyGarbage] Received pickups:", this.nextPickups);
      }

      this.updateDom(1000);
    }
  },

  capFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  svgIconFactory(binKey) {

    const color =
      (this.config.binColors && this.config.binColors[binKey]) ||
      "#787878";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "garbage-icon");
    svg.style.fill = color;

    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "href",
      this.file("garbage_icons.svg#bin")
    );

    svg.appendChild(use);

    return svg;
  },

  getDom() {

    const wrapper = document.createElement("div");

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

      const pickupContainer = document.createElement("div");
      pickupContainer.classList.add("garbage-container");

      const dateContainer = document.createElement("span");
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

      const iconContainer = document.createElement("span");
      iconContainer.classList.add("garbage-icon-container");

      pickup.bins.forEach(bin => {
        iconContainer.appendChild(this.svgIconFactory(bin));
      });

      pickupContainer.appendChild(iconContainer);

      if (i >= startFade && fadeSteps > 0) {
        pickupContainer.style.opacity = 1 - ((i - startFade) / fadeSteps);
      }

      wrapper.appendChild(pickupContainer);
    }

    return wrapper;
  }

});
