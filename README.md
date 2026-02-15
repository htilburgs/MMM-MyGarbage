# MMM-MyGarbage
This a module for [MagicMirror²](https://github.com/MichMich/MagicMirror).
This displays the schedule for your Garbage pickup. It supports multiple types of garbage bins.
You can show the schedule using a CSV file (garbage_schedule.csv) of by using an ical URL.

![Screenshot](screenshot.png)

## Installation
Clone this repository in your modules folder, and install dependencies:

```
cd ~/MagicMirror/modules 
git clone https://github.com/htilburgs/MMM-MyGarbage.git
cd MMM-MyGarbage
npm install 
```
## Update
When you need to update this module:

```
cd ~/MagicMirror/modules/MMM-MyGarbage
git pull
npm install
```
## Configuration
Go to the MagicMirror/config directory and edit the config.js file.
Add the module to your modules array in your config.js.

```
{
        module: 'MMM-MyGarbage',
        position: 'top_right',
        header: "My Garbage Calendar",
        disabled: false,
        config: {
                weeksToDisplay: 4,
                limitTo: 99,
                dateFormat: "dddd LL",
                alert: true,
                alertThreshold: 5, // give alert when there are 5 entries or less in CSV 
                fade:true,
                fadePoint: 0.25,
                dataSource: "csv",                         // csv (schedule_garbage.csv | ical (put URL in icalUrl)
                icalUrl: "PLACE_HERE_PUBLIC_ICAL_URL",      // only used if dataSource is "ical"
                debug: false,                               // Only set on true for debugging 
                binColors: {                                // Define custom Bin Colors
                            GreenBin: "#00A651",
                            PaperBin: "#0059ff",
                            GarbageBin: "#787878",
                            PMDBin: "#ffff00",
                            OtherBin: "#B87333"
                            },
                icalBinMap: {                                // Map iCal event names to standard bin names
                            "PAPIER": "PaperBin",
                            "GFT": "GreenBin",
                            "PMD": "PMDBin",
                            "REST": "GarbageBin",
                            "KERSTBOOM": "OtherBin",
                            }
                }
},
```

## Module configuration
Here is the documentation of options for the modules configuration:

<table>
  <thead>
    <tr>
      <th>Option</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>weeksToDisplay</code></td>
      <td>How many weeks into the future to show collection dates.<br /><br /><strong>Number</strong><br />Default: <code>2</code></td>
    </tr>
    <tr>
      <td><code>limitTo</code></td>
      <td>Limit the display to the spcified number of pickups.<br /><br /><strong>Number</strong><br />Default: <code>99</code></td>
    </tr>
    <tr>
      <td><code>dateFormat</code></td>
      <td>Format to use for the date of events <br /><br /><strong>Default: </strong><code>dddd D MMMM</code> (e.g. January 18)<br /><strong>Possible values: </strong>See https://momentjs.com/</td>
    </tr>
    <tr>
      <td><code>alert</code></td>
      <td>(optional) Show alert, if remaining entries in csv file fall under this threshold<br /><br /><strong>Number</strong><br />Default: <code>false</code></td>
    </tr>
    <tr>
      <td><code>fade</code></td>
      <td>Fade the future events to black. (Gradient).<br /><strong><br />Default: </strong><code>true</code><br /><strong>Possible values: </strong><code>true</code> or <code>false</code>
      </td>
    </tr>
        <tr>
      <td><code>fadePoint</code></td>
      <td>Where to start fade?<br /><strong><br />Default: </strong><code>0.25</code><br /><strong>Possible values: </strong><code>0</code> (top of the list) - <code>1</code> (bottom of list)
      </td>
    </tr>
        <tr>
      <td><code>dataSource</code></td>
      <td>Select datasource your're using<br /><strong><br />Default: </strong><code>"csv"</code><br /><strong>Possible values: </strong><code>"csv" or "ical" </code>
      </td>
    </tr>
        <tr>
      <td><code>icalUrl</code></td>
      <td>Fill in your (public) ical URL<br />Only use in combination with dataSourc: "ical" 
      </td>
    </tr>
        <tr>
      <td><code>debug</code></td>
      <td>For debugging the module when failure<br /><strong><br />Default: </strong><code>false</code><br /><strong>Possible values: </strong><code>true</code> or <code>false</code>
      </td>
    </tr>
 <tr>
      <td><code>binColors</code></td>
      <td>Define your own Bin Colors<br />
      </td>
    </tr>
<tr>
      <td><code>icalBinMap</code></td>
      <td>Define the <strong>EXACT</strong> names as provided in the iCal Calendar.<br />The names will be matches with the type of Bin.<br />If there is no match, otherBin wil be used.<br/>
      </td>
    </tr>
  </tbody>
</table>
  </tbody>
</table>

## Creating and using your Garbage Schedule for use with dataSource CSV
You can use this module by creating your own Garbage Schedule file with the name `garbage_schedule.csv` 
An example file `garbage_schedule.csv` is added.

Create a CSV based on the following template:

```
WeekStarting,GreenBin,GarbageBin,PaperBin,PMDBin,OtherBin
03/07/18,1,0,1,0,0
03/14/18,1,1,1,0,0
03/21/18,1,0,1,0,1
03/28/18,1,1,1,1,0
```

Default there are 3 bins defined (green, gray and blue) If you need more garbage bins, simply add an extra column in the `garbage_schedule.csv` file. The name is the color you like the bin to have. 

Add lines for each garbage pickup date as needed.
The date format needs to be specified as `MM/DD/YY` (e.g.: 05/28/18 for 28-May-2018)

Colors can be defined in the config.js file:
* Legacy Values:
  * GreenBin (defaults to #00A651)
  * GarbageBin (defaults to #787878)
  * PaperBin (defaults to #0059ff)
  * PMDBin (defaults to #ffff00)
  * OtherBin (defaults to #B87333)
* Any CSS color string (red, chocolate, cornflowerblue, etc..)
* Any HEX-Color (#FF0000, #8c8c8c, etc)
* Any rgb, rgba or hsl value **if in double quotes** ("rgb(128,65,98)", "rgba(134,56,32,0.5)", "hsl(0, 100%, 50%)", etc.)

The following is **VERY** important:
* The CSV file must be delimited using commas
* The date format needs to be specified as `MM/DD/YY` (e.g.: 05/28/18 for 28-May-2018)
* The remaining fields of each line specify whether the particular waste product is scheduled to be picked up on the given date. A value of `0` means no pick up. A value of ANYTHING ELSE means the product will be picked up.  Using the first pick up date entry in the template above, `1,0,1` means that `green` and `blue` will be picked up on that date, while `gray` will not be picked up.

Save the file as `garbage_schedule.csv` in the `MMM-MyGarbage` directory and restart Magic Mirror²

## License
### The MIT License (MIT)

Copyright © 2019 Harm Tilburgs

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

The software is provided “as is”, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages or other liability, whether in an action of contract, tort or otherwise, arising from, out of or in connection with the software or the use or other dealings in the software.

#### Note
The original script is from Jeff Clarke `MMM-MyWastePickup` and only for the Toronto area.
Now it has become a general script, to use in all areas all over the world. 

## Versions
1.0.0        : Initial version </br>
1.0.1        : Minor changes </br>
2.0.0        : Changed for use with CSV or with iCal Calendar </br>
2.0.1        : Update for Streamline date parsing and allow for recurring events in ical (thx to @thepagan)


