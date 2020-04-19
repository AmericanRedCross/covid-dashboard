const settings = require('../settings.js')

const fs = require('fs')
const path = require('path');

const async = require('async')
const Papa = require('papaparse')
const needle = require('needle')
const { DateTime } = require("luxon")

var d3 = require("d3");

var WHO = function() {}

WHO.prototype.whoGlobalData = function(callback) {
  // takes the iso2 codes available in our geo file and links WHO data to them
  var whoCases = [];
  whoCases = whoCases.concat({
    name_icrc: "not matched",
    ISO2: "N/A",
    population: ""
  })
  console.log("starting whoGlobalData ...")
  async.waterfall([
    function(cb){
      console.log("grabbing geo lookup file ...")
      // let's grab the file storing iso2 from our boundaries file and populations
      Papa.parse(fs.readFileSync(path.join(__basedir,'data','geo-lookup.csv'), 'utf8'), {
        header: true,
        error: function(error) {
          if(error) cb(error)
        },
        complete: function(results) {
          async.each(results.data, function(row, eachCallback) {
            whoCases = whoCases.concat({
              name_icrc: row.NAME_ICRC,
              ISO2: row.ISO2,
              population: row.ne_population
            })
            eachCallback()
          }, function(err){ 
            if(err) cb(err)
            cb();
          });
        }
      });
      
    },
    function(cb) { //step 2
      console.log("data fetch ...")
      const globalDataURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSe-8lf6l_ShJHvd126J-jGti992SUbNLu-kmJfx1IRkvma_r4DHi0bwEW89opArs8ZkSY5G2-Bc1yT/pub?gid=0&single=true&output=csv"
      needle.get(globalDataURL, function(error, response) {
        if (error) cb(error)
        if (!error && response.statusCode == 200)
          Papa.parse(response.body, {
            header: true,
            error: function(error) {
              if(error) cb(error)
            },
            complete: function(results) {
              var entries = d3.nest()
                .key(function(d) { return d.ISO_2_CODE; })
                .sortValues(function(a,b) { return ((DateTime.fromISO(a.date_epicrv) > DateTime.fromISO(b.date_epicrv)) ? -1 : 1); return 0;} )
                .entries(results.data)
              myCount= 0
              async.each(entries, function(item, eachCallback){
                var indexMatch = whoCases.findIndex(function(element){ return element.ISO2 === item.key; });
                if(indexMatch !== -1) {
                  // if the WHO iso2 matches a boundary's iso2 then add case data from the most recent entry
                  whoCases[indexMatch].newCasesWHO = item.values[0].NewCase;
                  whoCases[indexMatch].WHO_date = item.values[0].date_epicrv;
                  whoCases[indexMatch].cumCasesWHO = item.values[0].CumCase;
                  whoCases[indexMatch].cumDeathsWHO = item.values[0].CumDeath;
                  if(whoCases[indexMatch].population.length>0){
                    whoCases[indexMatch].per100k = (item.values[0].NewCase / whoCases[indexMatch].population)* 100000
                  }
                } else {
                  myCount++
                  var missingIso = whoCases.findIndex(function(element){ return element.ISO2 === "N/A"; });
                  whoCases[missingIso].WHO_date = ""; // our CSV write doesn't work if the key doesn't exist for all objects
                  whoCases[missingIso].per100k = ""; // our CSV write doesn't work if the key doesn't exist for all objects
                  if(!whoCases[missingIso].newCasesWHO){
                    whoCases[missingIso].newCasesWHO = Number(item.values[0].NewCase);
                  } else { whoCases[missingIso].newCasesWHO += Number(item.values[0].NewCase); }
                  if(!whoCases[missingIso].cumCasesWHO){
                    whoCases[missingIso].cumCasesWHO = Number(item.values[0].CumCase);
                  } else { whoCases[missingIso].cumCasesWHO += Number(item.values[0].CumCase); }
                  if(!whoCases[missingIso].cumDeathsWHO){
                    whoCases[missingIso].cumDeathsWHO = Number(item.values[0].CumDeath);
                  } else { whoCases[missingIso].cumDeathsWHO += Number(item.values[0].CumDeath); }
                }
                eachCallback();
              }, function(err){
                cb(err)
              })
            }
          });
      })
    }],
    function(err){ // this is called if there is an error in a step or once done all steps
      if(err) {
        callback(err, null)
      } else {
        console.log("writing the CSV ...");
        var whoGlobalCsv = Papa.unparse(whoCases);
        const outputWhoGlobalCsv = path.join(__basedir,'data','who_global_latest.csv');
        if (fs.existsSync(outputWhoGlobalCsv)) {
          fs.unlinkSync(outputWhoGlobalCsv);
        }
        fs.writeFileSync(outputWhoGlobalCsv, whoGlobalCsv);
        
        callback(null, "done WHO.whoGlobalData")
      }
    }
  )

}

WHO.prototype.mergeWithCSSE = function(callback) {
  
  async.waterfall([
    function(cb){
      // get CSSE data
      console.log("load csse data ...")
      Papa.parse(fs.readFileSync(path.join(__basedir,'data','csse_latest.csv'), 'utf8'), {
        header: true,
        error: function(error) {
          if(error) cb(error)
        },
        complete: function(results) {
          cb(null, results.data);
        }
      });
    },
    function(csseData, cb){
      // get WHO data
      console.log("load who data ...")
      Papa.parse(fs.readFileSync(path.join(__basedir,'data','who_global_latest.csv'), 'utf8'), {
        header: true,
        error: function(error) {
          if(error) cb(error)
        },
        complete: function(results) {
          cb(null, csseData, results.data);
        }
      });
      
    },
    function(csseData, whoData, cb){
      console.log("merging datasets ...")
      async.each(csseData, function(item, eachCallback){
        var indexMatch = whoData.findIndex(function(element){ return element.ISO2 === item.ISO2; });
        Object.assign(whoData[indexMatch], item)
        eachCallback();
      }, function(err){
        cb(null, whoData)
      })       
    }],
    function(err, whoData){
      if(err) {
        callback(err, null)
      } else {
        console.log("writing the CSVs ...");
        var dashboardCsv = Papa.unparse(whoData);
        const outputDashboard = path.join(__basedir,'data','dashboard_latest.csv');
        if (fs.existsSync(outputDashboard)) {
          fs.unlinkSync(outputDashboard);
        }
        fs.writeFileSync(outputDashboard, dashboardCsv);
        callback(null, "done merge.")
      }
    })
}  

module.exports = WHO;
