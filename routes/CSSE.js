const settings = require('../settings.js')

const fs = require('fs')
const path = require('path');

const async = require('async')
const crossfilter = require('crossfilter2');
const Papa = require('papaparse')
const needle = require('needle')
const { DateTime } = require("luxon")


const confirmedGlobalURL = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv";
const deathsGlobalURL = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv";
const recoveredGlobalURL = "https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_recovered_global.csv";

var CSSE = function() {}

var csseLookup = {};
Papa.parse(fs.readFileSync(path.join(__basedir,'data','csse-lookup.csv'), 'utf8'), {
  header: true,
  error: function(error) {
    if(error) console.log(error)
  },
  complete: function(results) {
    async.each(results.data, function(row, cb) {
      var myKey = row.country
      var myValue = row['icrc-iso2']
      csseLookup[myKey] = myValue
      cb();
    }, function(err){ 
      if(err) console.log(err)
    });
  }
});
// fs.readFile(path.join(__basedir,'data','csse-lookup.csv'), 'utf8', (err, data) => {
//   if (err) {
//     console.log(err)
//   }
//   Papa.parse(data, {
//     header: true,
//     error: function(error) {
//       console.log(error)
//     },
//     complete: function(results) {
//       async.each(results.data, function(row, cb) {
//         // console.log(row)
//         var myKey = row.country
//         var myValue = row.iso3
//         csseLookup[myKey] = myValue
//         cb();
//       }, function(err){ 
//         // ...
//       });
//     }
//   });
// })

CSSE.prototype.lookupISO = function(name, callback) {
  callback(null, csseLookup[name])
}

CSSE.prototype.findLatestColumn = function(headers, callback) {
  var latestKey = "";
  var latestDt = DateTime.fromObject({day: 1, month:1, year:2000});
  async.each(headers, function(item, cb){
    var thisDt = DateTime.fromFormat(item, "M/d/yy");
    if (thisDt.isValid) {
      if(thisDt > latestDt) {
        latestDt = thisDt;
        latestKey = item;
      }
    } 
    cb();
  }, function(err){
    callback(err, latestKey)
  })
}

CSSE.prototype.getLatest = function(callback) {
  console.log("csse getLatest ...")
  var self = this;
  var csseLatest = [];
  var csseSummary = [{confirmed:0,deaths:0,recovered:0}];
  async.waterfall([
    function(cb) { //step 1
      console.log("time_series_covid19_confirmed_global.csv ...")
      needle.get(confirmedGlobalURL, function(error, response) {
        if (error) cb(error)
        if (!error && response.statusCode == 200)
          Papa.parse(response.body, {
            header: true,
            error: function(error) {
              if(error) cb(error)
            },
            complete: function(results) {
              // find the column header that's the most recent date
              self.findLatestColumn(Object.keys(results.data[0]),function(err,latestColumn){
                // some countries are split across multiple rows via "Province/State" values
                // so we're going to use crossfilter to aggregate those
                var cf = crossfilter(results.data); // construct a new crossfilter
                cf.remove((d,i) =>!d["Country/Region"]); // get rid of data that doesn't have a country key, our parsing was for some reason returing a data object of just { 'Province/State': '' }
                var countries = cf.dimension(d => d["Country/Region"] );
                var confirmedByCountry = countries.group().reduceSum(d => d[latestColumn]);
                // we're going to save just the iso and the confirmed number
                async.each(confirmedByCountry.all(), function(item, eachCallback){
                  csseLatest = csseLatest.concat({
                    iso: csseLookup[item.key],
                    confirmed: item.value
                  })
                  csseSummary[0].confirmed += item.value
                  eachCallback();
                }, function(err){
                  csseSummary[0].date_confirmed = latestColumn
                  cb(err)
                })
              })
            }
          });
      })
    },
    function(cb) { // step 2
      console.log("time_series_covid19_deaths_global.csv ...")
      needle.get(deathsGlobalURL, function(error, response) {
        if (error) cb(error)
        if (!error && response.statusCode == 200)
          Papa.parse(response.body, {
            header: true,
            error: function(error) {
              if(error) cb(error)
            },
            complete: function(results) {
              // find the column header that's the most recent date
              self.findLatestColumn(Object.keys(results.data[0]),function(err,latestColumn){
                // some countries are split across multiple rows via "Province/State" values
                // so we're going to use crossfilter to aggregate those
                var cf = crossfilter(results.data); // construct a new crossfilter
                cf.remove((d,i) =>!d["Country/Region"]); // get rid of data that doesn't have a country key, our parsing was for some reason returing a data object of just { 'Province/State': '' }
                var countries = cf.dimension(d => d["Country/Region"] );
                var deathsByCountry = countries.group().reduceSum(d => d[latestColumn]);
                // we're going to save just the iso and the deaths number
                async.each(deathsByCountry.all(), function(item, eachCallback){
                  var indexMatch = csseLatest.findIndex(element => element.iso === csseLookup[item.key])
                  csseLatest[indexMatch].deaths = item.value
                  csseSummary[0].deaths += item.value
                  eachCallback();
                }, function(err){
                  csseSummary[0].date_deaths = latestColumn
                  cb(err)
                })
              })
            }
          });
      })
    },
    function(cb){ // step 3
      console.log("time_series_covid19_recovered_global.csv ...")
      needle.get(recoveredGlobalURL, function(error, response) {
        if (error) cb(error)
        if (!error && response.statusCode == 200)
          Papa.parse(response.body, {
            header: true,
            error: function(error) {
              if(error) cb(error)
            },
            complete: function(results) {
              // find the column header that's the most recent date
              self.findLatestColumn(Object.keys(results.data[0]),function(err,latestColumn){
                // some countries are split across multiple rows via "Province/State" values
                // so we're going to use crossfilter to aggregate those
                var cf = crossfilter(results.data); // construct a new crossfilter
                cf.remove((d,i) =>!d["Country/Region"]); // get rid of data that doesn't have a country key, our parsing was for some reason returing a data object of just { 'Province/State': '' }
                var countries = cf.dimension(d => d["Country/Region"] );
                var recoveredByCountry = countries.group().reduceSum(d => d[latestColumn]);
                // we're going to save just the iso and the recovered number
                async.each(recoveredByCountry.all(), function(item, eachCallback){
                  var indexMatch = csseLatest.findIndex(element => element.iso === csseLookup[item.key])
                  csseLatest[indexMatch].recovered = item.value
                  csseSummary[0].recovered += item.value
                  eachCallback();
                }, function(err){
                  csseSummary[0].date_recovered = latestColumn
                  cb(err)
                })
              })
            }
          });
      })
    },
    function(cb){
      // go ahead and calculat the currently infected
      csseSummary[0].infected_calc = csseSummary[0].confirmed - csseSummary[0].deaths - csseSummary[0].recovered
      cb(null);
    }],
    function(err){ // this is called if there is an error in a step or once done all steps
      if(err) {
        callback(err, null)
      } else {
        console.log("writing the CSVs ...");
        var latestCsv = Papa.unparse(csseLatest);
        const outputLatest = path.join(__basedir,'data','csse_latest.csv');
        if (fs.existsSync(outputLatest)) {
          fs.unlinkSync(outputLatest);
        }
        fs.writeFileSync(outputLatest, latestCsv);
        
        var summaryCsv = Papa.unparse(csseSummary);
        const outputSummary = path.join(__basedir,'data','csse_summary.csv');
        if (fs.existsSync(outputSummary)) {
          fs.unlinkSync(outputSummary);
        }
        fs.writeFileSync(outputSummary, summaryCsv);
        callback(null, "done CSSE.getLatest")
      }
    }
  )
}

module.exports = CSSE;
