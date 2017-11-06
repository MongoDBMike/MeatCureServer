var express = require("express");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var ObjectID = mongodb.ObjectID;

var exec = require('child_process').exec;
var sys = require('sys');

assert = require('assert');

var STATUS_COLLECTION = "status";

var fanStatus = "Off";
var humidifierStatus = "Off";
var fridgeStatus = "Off";

// vars to know when to trigger the fan AND for how long
var fanOffDuration = 0;
var fanOnDuration = 0;

var fanOnTime = 120;
var fanOffTime = 1200;


var automated = true;

var LOGGING = 1;

var app = express();
app.use(bodyParser.json());

var buttonRecord = new Object();
var statusRecord = new Object();

var sensor = require('node-dht-sensor');



var atlasURI = "mongodb://MichaelRioux:xxxxxxxxxx@mikesdemo-shard-00-00-ri4jv.mongodb.net:27017,mikesdemo-shard-00-01-ri4jv.mongodb.net:27017,mikesdemo-shard-00-02-ri4jv.mongodb.net:27017/MeatCuring?ssl=true&replicaSet=MikesDemo-shard-0&authSource=admin";


var fanOnCode = "5330371";
var fanOffCode = "5330380";
var humidifierOnCode = "5330227";
var humidifierOffCode = "5330236";
var fridgeOnCode = "5330691";
var fridgeOffCode = "5330700";




function puts(error, stdout, stderr) { sys.puts(stdout) }

//function execute(command, callback){
  //  exec(command, function(error, stdout, stderr){ callback(stdout); });
//};

// Create a database variable outside of the database connection callback to reuse the connection pool in your app.
var db;

console.log("tryin to connect to mongo now");
// Connect to the database before starting the application server.
mongodb.MongoClient.connect(atlasURI, function (err, database) {
    if (err) {
        console.log(err);
        process.exit(1);
        }
                            
    // Save database object from the callback for reuse.
    db = database;
    console.log("Database connection ready");
                            
                            
    // read the last status, update the vars.
    /*
    db.collection(STATUS_COLLECTION).findOne({},{sort:{time:-1}}, function(err, doc) {
                                                                     
        console.log("from first: GET /api/status");
        assert.equal(null, err);
        fanStatus = doc.status.Fan;
        humidifierStatus = doc.status.Humidifier;
        fridgeStatus = doc.status.Fridge;
        console.log("FanStatus: " + fanStatus);
        console.log("HumidifierStatus: " + humidifierStatus);
        console.log("FridgeStatus: " + fridgeStatus);
        
    });
                         
      */
                            
    // start with everything off
    exec("sudo /var/www/rfoutlet/codesend 5330380", puts);
    exec("sudo /var/www/rfoutlet/codesend 5330236", puts);
    exec("sudo /var/www/rfoutlet/codesend 5330700", puts);
                            
    fanStatus = "Off";
    humidifierStatus = "Off";
    fridgeStatus = "Off";
    console.log("Everything is Off");
                            
                            
    // Initialize the app.
        app.listen(8090);
        console.log("Listening on port 8090")
                            
    // run a timer that write the Temp&Humidity along with buttons.
    
    setInterval(updateTH, 5000);
                            
   // var server = app.listen(8090, function () {
    //    var port = server.address().port;
     //   console.log("App now running on port", port);
   // });
});

//API ROUTES BELOW

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
    console.log("ERROR: " + reason);
    res.status(code || 500).json({"error": message});
}

/*  "/api/contacts"
 *    GET: finds all contacts
 *    POST: creates a new contact
 */


function updateTH(){
 
    
    delete statusRecord._id;
    
    
    
    console.log("Sensor read");
    sensor.read(22, 16, function(err, temperature, humidity) {
                if (!err) {
                
                    statusRecord.humidity = humidity.toFixed(1);
                    statusRecord.temp = ( temperature.toFixed(1) * (9 / 5) + 32).toFixed(1);
                    statusRecord.time = new Date(Date.now()).toISOString();
                
                    console.log("")
                

                // set button status'
                buttonRecord.Fan = fanStatus;
                buttonRecord.Fridge = fridgeStatus;
                buttonRecord.Humidifier = humidifierStatus;
                statusRecord.status = buttonRecord;
                
                // print record
                console.log(statusRecord);
               
                if (automated)
                    console.log("Auto On");
                else
                    console.log("Auto Off");
               
                
                // write to mongo
                
                    db.collection(STATUS_COLLECTION).insertOne(statusRecord, function(err, r) {
                                                               
                         if (!err) {
                              assert.equal(1, r.insertedCount);
                              console.log("Doc Inserted");
                                                               
                         } else {
                            if (LOGGING > 0 ) {
                                console.log(err);
                            }
                         }
                   });
            }
    });
    
    
    //if were automated, lets run some calcs and decide how we want the fridge to react.
    if(automated) {
        
        var sendingSig = false;
        console.log("Automating...");
        
        
        // check temp
        // Reasons to change fridge on
        // if temp is > 55 (too warm)
        // if humidity > 68 (getting too humid)
        // Reasons to change fridge off
        // if temp is < 48 (too cold)
        
        if(statusRecord.temp > 55.0 && fridgeStatus === "Off") {
            console.log("Temp too high.");
            console.log("Auto: Turning on Fridge");
            
            fridgeStatus = "On";
            exec("sudo /var/www/rfoutlet/codesend 5330691", puts);
            console.log("Fridge On");
            sendingSig = true;
            
        } else if (statusRecord.humidity > 67.0 && statusRecord.temp > 50.0 && fridgeStatus === "Off") {
            console.log("Humidity is too high and we can turn on fridge");
            console.log("Auto: Turning on Fridge");
            
            fridgeStatus = "On";
            exec("sudo /var/www/rfoutlet/codesend 5330691", puts);
            console.log("Fridge On");
            sendingSig = true;
            
        } else if (statusRecord.temp < 48.0 && fridgeStatus === "On") {
            console.log("Temperature is too Low.");
            console.log("Auto: Turning off Fridge");
            
            fridgeStatus = "Off";
            exec("sudo /var/www/rfoutlet/codesend 5330700", puts);
            console.log("Fridge Off");
            sendingSig = true;
            
        }
        
        
        
        // check Humidity
        // Reasons to change Deumidifier on
        // if Humidity is > 60 (too dry)
        // Reasons to change Humidifier off
        // if humidity > 62 & fridge off (getting too humid and no fridge to counter act)
        // if humidity > 67 (getting too humid even if the fridge is on)
        if(!sendingSig) {
            if(statusRecord.humidity < 50.0 && humidifierStatus === "On") {
                console.log("Humidity is getting to Low.");
                console.log("Automation: Turning off the DeHumidifer");
            
                humidifierStatus = "Off";
                exec("sudo /var/www/rfoutlet/codesend 5330236", puts);
                console.log("DeHumidifier Off");
                sendingSig = true;
            
            } else if (statusRecord.humidity > 62.0 && humidifierStatus === "Off") {
                console.log("Humidity is getting to High");
                console.log("Automation: Turning on the Dehumidifier");
                
                humidifierStatus = "On";
                exec("sudo /var/www/rfoutlet/codesend 5330227", puts);
                console.log("Dehumidifier On");
                sendingSig = true;
            }
            
            
            /*else if (statusRecord.humidity > 65.0 && fridgeStatus === "On" && humidifierStatus === "Off") {
                console.log("Humidity is getting to high with the fridge not on");
                console.log("Automation: Turning on the Humidifier");
            
                humidifierStatus = "Off";
                exec("sudo /var/www/rfoutlet/codesend 5330236" , puts);
                console.log("Humidifier Off");
                sendingSig = true;*/
            
            
        }
        
        
        // check Fan
        // Reasons to turn fan on
        // if Fan hasnt run in 28m
        // Reasons to turn fan off
        // if Fan ran for 2m straight
        
        if(!sendingSig) {
            if (fanOffDuration >= fanOffTime && fanStatus === "Off") {
                console.log("Fan has not be on in too long");
                console.log("Automation: Turning On Fan");
            
                fanStatus = "On";
                fanOffDuration = 0;
            
                exec("sudo /var/www/rfoutlet/codesend 5330371" , puts);
                console.log("Fan On");
            
            } else if ( fanOnDuration >= fanOnTime && fanStatus === "On") {
                console.log("Fan has been on for too long");
                console.log("Automation: Turning Off Fan");
            
                fanStatus = "Off";
                fanOnDuration = 0;
            
                exec("sudo /var/www/rfoutlet/codesend 5330380" , puts);
                console.log("Fan Off");
            }
        }
        
        
        // set fan times
        if(fanStatus === "On"){
            fanOnDuration += 5;
            console.log("Fan On: " + fanOnDuration + "s");
            console.log("Off in: " + (fanOnTime - fanOnDuration) + "s");
        } else if(fanStatus === "Off"){
            fanOffDuration += 5;
            console.log("Fan Off: " + fanOffDuration + "s");
            console.log("On in: " + (fanOffTime - fanOffDuration) + "s");
        }
        
    } // end if auto
    
    
    
 
}



app.get("/api/status", function(req, res) {
        db.collection(STATUS_COLLECTION).findOne({},{sort:{time:-1}}, function(err, doc) {
                                                 
        console.log("GET /api/status");
        if (err) {
            handleError(res, err.message, "Failed to get status.");
        } else {
           // test to see if we can append to doc
            if (automated)
                doc.automation = "On";
            else
                doc.automation = "Off"
           res.status(200).json(doc);
        }
   });
});


app.post("/api/status", function(req, res) {
    var newStatus = req.body;
         
    if (!req.body.temp) {
        handleError(res, "Invalid user input", "Must provide a temperature.", 400);
    }
         
    db.collection(STATUS_COLLECTION).insertOne(newStatus, function(err, doc) {
        if (err) {
            handleError(res, err.message, "Failed to create new contact.");
        } else {
            res.status(201).json(doc.ops[0]);
        }
    });
});





//log when fan on button press
app.get("/api/FanOn", function(req, res) {
        
        console.log("Fan On");
        fanStatus = "On";
        res.status(200).json("{ok:1}");
        
        console.log("Button Status:");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330371", puts);
        fanOffDuration = 0;
});

//log when fan off button press
app.get("/api/FanOff", function(req, res) {
        
        console.log("Fan Off");
        fanStatus = "Off";
         res.status(200).json("{ok:1}");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330380", puts);
        fanOnDuration = 0;
        
});

//log when fridge on button press
app.get("/api/FridgeOn", function(req, res) {
        
        console.log("Fridge On");
        fridgeStatus = "On";
        res.status(200).json("{ok:1}");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330691", puts);
        
        
});

//log when fridge off button press
app.get("/api/FridgeOff", function(req, res) {
        
        console.log("Fridge Off");
        fridgeStatus = "Off";
        res.status(200).json("{ok:1}");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330700", puts);
        
});

//log when humidifier on button press
app.get("/api/HumidifierOn", function(req, res) {
        
        console.log("Humidifier On");
        humidifierStatus = "On";
        res.status(200).json("{ok:1}");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330227", puts);
        
});

//log when humidifier off button press
app.get("/api/HumidifierOff", function(req, res) {
        
        console.log("Humidifier Off");
        humidifierStatus = "Off";
        res.status(200).json("{ok:1}");
        console.log("Fan:" + fanStatus + "   Humidifier:" + humidifierStatus + "   Fridge:" + fridgeStatus);
        exec("sudo /var/www/rfoutlet/codesend 5330236", puts);
        
});

app.get("/api/automatedOn", function(req, res) {
        
        console.log("Turning Automation On");
        
        res.status(200).json("{ok:1}");
        
        automated = true;
        
        });

app.get("/api/automatedOff", function(req, res) {
        
        console.log("Turning Automation Off");
        automated = false;
        res.status(200).json("{ok:1}");
        
        
        });


