const settings = require('../settings.js')

const fs = require('fs')
const path = require('path');

const async = require('async')
const Papa = require('papaparse')
const needle = require('needle')
const { DateTime } = require("luxon")

var d3 = require("d3");

var WHO = function() {}

WHO.prototype.casesPer100kMapping = function(callback) {
  // takes the iso2 codes available in our geo file and links WHO new cases to them
  // if a WHO iso2 code doesn't have a match it's not in the output
  var newCases = [];
  
  console.log("starting casesPer100k based on WHO ...")
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
            newCases = newCases.concat({
              iso2: row.ISO2,
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
              
              async.each(entries, function(item, eachCallback){
                var indexMatch = newCases.findIndex(function(element){ return element.iso2 === item.key; });
                if(indexMatch !== -1) {
                  // if the WHO iso2 matches a boundary's iso2 then add case data
                  newCases[indexMatch].newCases = item.values[0].NewCase;
                  newCases[indexMatch].newCases_date = item.values[0].date_epicrv;
                  if(newCases[indexMatch].population.length>0){
                    newCases[indexMatch].per100k = (item.values[0].NewCase / newCases[indexMatch].population)* 100000
                  }
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
        console.log("writing the CSVs ...");
        var per100kCsv = Papa.unparse(newCases);
        const outputPer100k = path.join(__basedir,'data','per100kMapping_latest.csv');
        if (fs.existsSync(outputPer100k)) {
          fs.unlinkSync(outputPer100k);
        }
        fs.writeFileSync(outputPer100k, per100kCsv);
        
        callback(null, "done WHO.casesPer100kMapping")
      }
    }
  )

}

module.exports = WHO;
