Module.register("MMM-MyGarbage", {

  defaults: {
    alert: true,
    alertThreshold: 5,
    weeksToDisplay: 2,
    limitTo: 99,
    dateFormat: "dddd D MMMM",
    fade: true,
    fadePoint: 0.25,
    dataSource: "csv",
    icalUrl: "",
    debug: false,
    binColors: {
      GreenBin: "#00A651",
      PaperBin: "#0059ff",
      GarbageBin: "#787878",
      PMDBin: "#ffff00",
      OtherBin: "#B87333"
    }
  },

  getStyles() { return ["MMM-MyGarbage.css"]; },
  getScripts() { return ["moment.js"]; },

  getTranslations() {
    return { 
      en: "translations/en.json", 
      nl: "translations/nl.json", 
      de: "translations/de.json", 
      fr: "translations/fr.json",
      sv: "translations/sv.json"
    };
  },

  capFirst(str) { return str.charAt(0).toUpperCase() + str.slice(1); },

  start() {
    Log.info("Starting module: " + this.name);
    this.nextPickups = [];
    this.timer = null;
    this.errorMessage = null; // <-- store CSV/iCal errors
    this.sendSocketNotification("MMM-MYGARBAGE-CONFIG", this.config);
    this.getPickups();
  },

  getPickups() {
    clearTimeout(this.timer);

    this.sendSocketNotification("MMM-MYGARBAGE-GET", {
      weeksToDisplay: this.config.weeksToDisplay,
      instanceId: this.identifier,
      dataSource: this.config.dataSource,
      icalUrl: this.config.icalUrl
    });

    this.timer = setTimeout(() => this.getPickups(), 60 * 60 * 1000);
  },

  socketNotificationReceived(notification, payload) {

    // --- Handle errors ---
    if (notification === "MMM-MYGARBAGE-ERROR" + this.identifier) {
      this.errorMessage = payload;
      this.updateDom(1000);
      return;
    }

    // --- Pickup response ---
    if (notification === "MMM-MYGARBAGE-RESPONSE" + this.identifier && Array.isArray(payload)) {
      this.nextPickups = payload.slice().sort((a,b)=>new Date(a.pickupDate)-new Date(b.pickupDate));
      this.errorMessage = null;

      if (this.config.debug) {
        const sorted = this.nextPickups.slice().sort((a,b)=>new Date(a.pickupDate)-new Date(b.pickupDate));
        Log.info(`[MMM-MyGarbage] First 5 dates: ${sorted.slice(0,5).map(p=>p.pickupDate).join(", ")}`);
      }

      this.updateDom(1000);

    } else if (notification === "MMM-MYGARBAGE-NOENTRIES" + this.identifier && typeof payload === "number") {
      const entriesLeft = payload;
      const msgTemplate = this.translate("GARBAGE_ALERT_MESSAGE") || "Warning: Only {{entriesLeft}} garbage pickup entries left in CSV!";
      const msg = msgTemplate.replace("{{entriesLeft}}", entriesLeft);

      this.sendNotification("SHOW_ALERT", {
        title: this.translate("GARBAGE_ALERT_TITLE") || "Garbage Alert",
        message: msg,
        imageFA: "recycle",
        timer: 5000
      });

      if (this.config.debug) {
        Log.info(`[MMM-MyGarbage] ALERT: ${entriesLeft} pickups remaining`);
      }
    }
  },

  svgIconFactory(bin) {
    const color = (this.config.binColors && this.config.binColors[bin]) || "#ED2DB0";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "garbage-icon");
    svg.style.fill = color;
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", this.file("garbage_icons.svg#bin"));
    svg.appendChild(use);
    return svg;
  },

  getDom() {
    const wrapper = document.createElement("div");

    // --- Display error with red warning icon ---
    if (this.errorMessage) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "dimmed light small";
      errorDiv.style.color = "red";
      errorDiv.style.fontWeight = "bold";
      errorDiv.style.display = "flex";
      errorDiv.style.alignItems = "center";
      errorDiv.style.gap = "5px";

      const icon = document.createElement("span");
      icon.innerHTML = "⚠️";
      errorDiv.appendChild(icon);

      const msg = document.createElement("span");
      msg.innerHTML = this.errorMessage;
      errorDiv.appendChild(msg);

      return errorDiv;
    }

    if (this.nextPickups.length === 0) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    const startFade = this.config.fade && this.config.fadePoint > 0 && this.config.fadePoint < 1
      ? Math.min(this.nextPickups.length, this.config.limitTo) * this.config.fadePoint
      : 0;
    const fadeSteps = this.config.fade ? Math.min(this.nextPickups.length, this.config.limitTo) - startFade : 0;

    for (let i=0; i<this.nextPickups.length && i<this.config.limitTo; i++) {
      const pickup = this.nextPickups[i];
      const container = document.createElement("div");
      container.classList.add("garbage-container");

      const dateContainer = document.createElement("span");
      dateContainer.classList.add("garbage-date");
      const today = moment().startOf("day");
      const pickupDate = moment(pickup.pickupDate);

      if (today.isSame(pickupDate)) dateContainer.innerHTML = this.translate("TODAY");
      else if (today.clone().add(1,"days").isSame(pickupDate)) dateContainer.innerHTML = this.translate("TOMORROW");
      else if (today.clone().add(7,"days").isAfter(pickupDate)) dateContainer.innerHTML = this.capFirst(pickupDate.format("dddd"));
      else dateContainer.innerHTML = this.capFirst(pickupDate.format(this.config.dateFormat));

      container.appendChild(dateContainer);

      const iconContainer = document.createElement("span");
      iconContainer.classList.add("garbage-icon-container");
      pickup.bins.forEach(bin => iconContainer.appendChild(this.svgIconFactory(bin)));
      container.appendChild(iconContainer);

      if (this.config.fade && i >= startFade && fadeSteps>0) {
        container.style.opacity = 1 - ((i-startFade)/fadeSteps);
      }

      wrapper.appendChild(container);
    }

    if (this.config.debug) {
      const debugDiv = document.createElement("div");
      debugDiv.classList.add("garbage-debug");
      debugDiv.style.fontSize = "0.7em";
      debugDiv.style.marginTop = "5px";
      debugDiv.style.color = "red";
      debugDiv.style.whiteSpace = "pre-line";

      const sortedPickups = this.nextPickups.slice().sort((a,b)=>new Date(a.pickupDate)-new Date(b.pickupDate));
      let debugText = "DEBUG: Next Pickups Loaded:\n";
      sortedPickups.forEach(p => {
        const dateStr = moment(p.pickupDate).isValid() ? moment(p.pickupDate).format("YYYY-MM-DD") : String(p.pickupDate);
        debugText += `${dateStr} -> ${p.bins.join(", ")}\n`;
      });

      debugDiv.innerText = debugText;
      wrapper.appendChild(debugDiv);
    }

    return wrapper;
  }

});
