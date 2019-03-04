// Version v1.1.0
// Update: 01-03-2019
// Added Fade option

Module.register('MMM-MyGarbage', {

  // Default values
  defaults: {
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
 	// The translations for the default modules are defined in the core translation files.
	// Therefor we can just return false. Otherwise we should have returned a dictionary.
	// If you're trying to build your own module including translations, check out the documentation.
     return false;
  },

  capFirst: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },
	
  start: function() {
    Log.info('Starting module: ' + this.name);
    this.nextPickups = [];
    this.getPickups();
    this.timer = null;
  },

  // Read garbage_schedule.csv file
  getPickups: function() {
    clearTimeout(this.timer);
    this.timer = null;
    this.sendSocketNotification("MMM-MYGARBAGE-GET", {weeksToDisplay: this.config.weeksToDisplay, instanceId: this.identifier});

    //Set check times
    var self = this;
    this.timer = setTimeout( function() {
      self.getPickups();
    }, 60 * 60 * 1000); //update once an hour
  },

  socketNotificationReceived: function(notification, payload) {
    if (notification == "MMM-MYGARBAGE-RESPONSE" + this.identifier && payload.length > 0) {
      this.nextPickups = payload;
      this.updateDom(1000);
    }
  },

  // Create Garbage Icons from garbage_icons.svg
  svgIconFactory: function(glyph) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttributeNS(null, "class", "garbage-icon " + glyph);
    var use = document.createElementNS('http://www.w3.org/2000/svg', "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "href", this.file("garbage_icons.svg#") + glyph);
    svg.appendChild(use);
    return(svg);
  },   

  getDom: function() {
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
			var startFade = this.nextPickups.length * this.config.fadePoint;
			var fadeSteps = this.nextPickups.length - startFade;
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

      if (pickup.GreenBin) {
        iconContainer.appendChild(this.svgIconFactory("greenbin"));
      }
      if (pickup.GarbageBin) {
        iconContainer.appendChild(this.svgIconFactory("garbagebin"));
      }
      if (pickup.PaperBin) {
        iconContainer.appendChild(this.svgIconFactory("paperbin"));
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
