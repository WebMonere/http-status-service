'use strict';

const express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
const dotenv = require('dotenv');

var ping = require('ping');

// Rabit MQ Message Queue
var amqp = require('amqplib/callback_api');
// Message Queue Config

var messgaeQueueName= process.env.MESSAGE_QUEUE_NAME || 'main_notification_queue'
var messageQueueURL = process.env.MESSAGE_QUEUE_URl ||  'amqp://localhost'

//DB Config Load
var dbHost = process.env.DBHOST || 'localhost'
var dbPort = process.env.DBPORT || 28015
var dbName = process.env.DBNAME || 'UrlStatus'

//connecto to message queue


var r = require('rethinkdb')
var Pool = require('rethinkdb-pool')
var pool = Pool(r, {
    host: dbHost,
    port: dbPort,
    db: dbName,
})

//Env Conig
dotenv.config();
//Logger Conig
// create a custom timestamp format for log statements
const SimpleNodeLogger = require('simple-node-logger'),
    opts = {
        logFilePath:'app.log',
        timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
    },
log = SimpleNodeLogger.createSimpleLogger( opts );

// Constant
const UP="UP";
const DOWN="DOWN";
const UNKNOWN="Unknown"

var app = express();
// create application/json parser
var jsonParser = bodyParser.json()

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })
//app port
var port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send({"info":"http Status Checking Service"});
   
})


app.post('/check', urlencodedParser, (req, res) => {

    var url = req.body.url;
    var uid = req.body.uid;
 
    if(url == null || uid == null)
    {
        log.warn("Empty URL or UID is Passed in the endpoint");
        res.end("URL or UID is Empty");
    }else{
        httpstat(url,uid);
        // pingmonitorAsync(req.body.url);
        // hostCheck(req.body.url);
    
        res.send('Cheking..., ' + req.body.url);
    }
   

});


app.listen(port, function () {
    console.log('Server started on port: ' + port);
});


/* ************************** Handler function ******************************  */

// Note --> ICMP Protocol Only  No Port
// TODO: Verify Address Not Include prefix like www or http and PORT
function pingmonitorAsync(host) {
    ping.promise.probe(host)
        .then(function (res) {
            console.log(res);
        });
}
function hostCheck(host) {
    ping.sys.probe(host, function (isAlive) {
        var msg = isAlive ? 'host ' + host + ' is alive' : 'host ' + host + ' is dead';
        console.log(msg);
    });
}



function httpstat(url, urlid) {
    var statcode = null;
    var statmsg = null;
    var specialmessage = null;
    var appStat = null;
    var serverStat=null;
    var resTime=null;
    request({url,time : true}, function (error, response, body) {
        if (error) {
            /* Importnat Note if Connection Refused means Service may invalid or may down so send notification */
            if (error.code === 'ECONNREFUSED') {
                log.info("Conection Refused "+url);
                specialmessage = "Conecction Refused";
                statcode = 0;
                statmsg = UNKNOWN;
                serverStat=DOWN;
                appStat = UNKNOWN;
            } else if (error.code === 'ETIMEDOUT') {
                log.info("Conection Time Out "+url);
                specialmessage = "Coneection Time Out";
                statcode = 0;
                statmsg = UNKNOWN;
                serverStat=DOWN;
                appStat = UNKNOWN;
            }
            else {
                log.error(error);
                //console.log(error)
                return;
               
            }

        } else {
            /* Here Sucuessfully respose came means server UP but App is Down/UP/Anything */

            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
            serverStat = response && UP;
            resTime =response.elapsedTime;
            //TODO: Now Check the Status Code and Status Messgae
            if (response.statusCode >= 400) {
                //console.log("Site or App is Down");
                //TODO: If Status Code is 505 or 404 or Any Error Code Put Message on The Notification Queue
                console.log("Puttin the messgae in notification queue");

                specialmessage = "";
                statcode = response.statusCode;
                statmsg = response.statusMessage;
                appStat = DOWN;

                // Create Message Object
                var userMessage = {
                    'urlId':urlid,
                    "url":url,
                   'statusCode':statcode,
                   'statusMessage':statmsg,
                   'appStatus':appStat
                }
                console.log(userMessage)
                // send to message queue
                connectToMessageQueue(userMessage);

            }else{
            //TODO: Save Status Code and Stats Messgae in DB Queue or Call the DB MicroService
            console.log("Calling DB MicroService or DB Queue");
            specialmessage = "";
            statcode = response.statusCode;
            statmsg = response.statusMessage;
            appStat = UP;
            }

        }
        // Save to DB
         // Check if UID alredy exist or not

         var check_uid = r.table('urlstat').get(urlid);

         var promise = pool.run(check_uid);

         promise.then(function (list) {
             //check res
             if (list == null) {
                 //Save to DB
                 var query = r.table('urlstat').insert({
                     uid: urlid,
                     url:url,
                     statusCode: statcode,
                     statusMessage: statmsg,
                     responseTime: resTime,
                     specialMessage:specialmessage,
                     appStatus: appStat,
                     serverStatus:serverStat
                 });

                 pool.run(query, function (error, list) {
                     if(error){
                     log.error(error);
                     }
                 });
             }else{
                 var query = r.table('urlstat').filter({uid:urlid}).update({
                    url:url,
                     statusCode: statcode,
                     statusMessage: statmsg,
                     responseTime: resTime,
                     specialMessage:specialmessage,
                     appStatus: appStat,
                     serverStatus:serverStat
                 })

                 pool.run(query);
             }
         });


    });
}

/* ------------------------- Queue Service --------------------------------------- */
function connectToMessageQueue(message)
{
    amqp.connect(messageQueueURL, function(error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = messgaeQueueName;
    var msg = JSON.stringify(message);

    channel.assertQueue(queue, {
      durable: false
    });

    channel.sendToQueue(queue, Buffer.from(msg));
    console.log(" [x] Sent %s", msg);
    
  });
});
}

