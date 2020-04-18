global.__basedir = __dirname;
const settings = require('./settings.js');

const fs = require('fs');
const path = require('path');

const express = require('express');
const app = express();

app.use(express.static(path.join(__dirname, 'data')))
app.listen(settings.app.port, () => console.log('app listening on port ' + settings.app.port));

const CSSE = require('./routes/CSSE.js')
const csse = new CSSE()

const WHO = require('./routes/WHO.js')
const who = new WHO()

function sync() {
  csse.getLatest(function(err,result){
    console.log("result:", result)
    console.log("err:",err)
  });
  who.casesPer100kMapping(function(err,result) {
    console.log("result:", result)
    console.log("err:",err)
  });
}

// initialize...
sync();
// and set to run every 30 minutes...
var CronJob = require('cron').CronJob;
new CronJob('0 */30 * * * *', function() {
  sync()
}, null, true, 'America/New_York').start();