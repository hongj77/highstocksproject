
// way to use css in the body tag
function loadCSS(filename){ 
	"use strict";
       var file = document.createElement("link")
       file.setAttribute("rel", "stylesheet")
       file.setAttribute("type", "text/css")
       file.setAttribute("href", filename)

       if (typeof file !== "undefined")
          document.getElementsByTagName("head")[0].appendChild(file)
}

function analysisDirectiveController ($scope, Source,$routeParams,$filter,Listers) {
	// loadCSS("https://onping.aacs-us.com/static/angular/directives/dataanalysis/stylin.css");
	loadCSS('/static/angular/directives/dataanalysis/stylin.css');
	loadCSS('//maxcdn.bootstrapcdn.com/font-awesome/4.1.0/css/font-awesome.min.css');

	$scope.history = Source.history;
	$scope.getParameterInfoList = [];
	$scope.companyGetter = Listers.companyGetter;
	$scope.siteGetter = Listers.siteGetter;
	$scope.locGetter = Listers.locGetter;
	$scope.multiParamGetter = Listers.multiParamGetter;
	$scope.pidToTagCombined = Listers.pidToTagCombined;
	$scope.fromDate;
	$scope.filter = $filter('filter');

	if ($routeParams.hasOwnProperty("pid")) {
		$scope.getParameterInfoList.push(parseInt($routeParams.pid));
	}
}

var analysisDirectiveLink = function(scope) {
	"use strict";

	scope.companies = []; //all the companies that the resource got
	scope.sites = [];
	scope.locations = [];
	scope.parameters = [];

	scope.checkedCompanies = {}; //which ones have so far been selected
	scope.checkedSites = {};
	scope.checkedLocations = {};
	scope.checkedParameters = {};

	scope.fromDate; //current min time on chart
	scope.toDate; //current max time on chart

	var pidToName = {}; //keeps track of pids with their names
	var mySeries = []; //Chart's series. Do not refer to this to get data.
	var pidToRawData = {}; //keeps all the raw data in the series for that pid
	var myChart;
	var firstLoad = true;
	var initialData;

	//on initial load
	$(function () {

		//config object for the first 3 months 
		var current = (new Date()).getTime();
		var fivemonths = current - (1000*3600*24*30*5); 
		var initialStep = calculateStep(fivemonths,current);
		// current = new Date(current);
		// fivemonths = new Date(fivemonths);

		var initialConfigObj = {
			// start: JSON.stringify(fivemonths),
			// end: JSON.stringify(current),
			start:fivemonths,
			end:current,
			step: initialStep,
			delta: 15.0,
			pid: scope.getParameterInfoList
		}

		scope.history.get(initialConfigObj, function (data) {	
			initialData = data;

			createChart();
			trailCheck();

			//do this or else the chart doesn't like to refresh
			myChart.xAxis[0].setExtremes(null,null);
		});
	});


	//---------------------------------------------------ALL COMPANY FUNCTIONS

	//check/uncheck a company and get/remove its sites
	scope.checkCompanies = function (company) {
		if (scope.checkedCompanies[company.key] == true) {
			scope.checkedCompanies[company.key] = false;

			//remove all the sites that are assosiated with this company
			var companyId = company.value.refId;
			for (var i = 0; i < scope.sites.length; i++) {
				if (scope.sites[i].value.cid == companyId) {
					//uncheck all sites associated with this company
					scope.checkedSites[scope.sites[i].key] = true;
					scope.checkSites(scope.sites[i]); 
					//take away from sites array
					scope.sites.splice(i,1);
					//revert none/all button 
					scope.siteAll = false;
					i -= 1;

				}
			}
		} 
		else if (scope.checkedCompanies[company.key] == false) {
			scope.checkedCompanies[company.key] = true;

			var keys = _.keys(scope.checkedCompanies);
			var refIdArr = [];
			_.each(scope.companies, function (company) {
				if (scope.checkedCompanies[company.key] == true) {
					refIdArr.push(company.value.refId);
				}
			});

			//POST selected sites in refIdArr
			scope.siteGetter.get({getCompanyLookupList: refIdArr, getSiteLookupId: null},{}, function (sites) {
				scope.sites = sites;

				//initiailize all checked sites with false
				for (var i = 0; i < scope.sites.length; i++) {
					var key = scope.sites[i].key;
					if (!(key in scope.checkedSites)) {
						scope.checkedSites[key] = false;
					} 
				}
			});
		}
	};

	//check/uncheck all companies
	scope.compAll = false;
	scope.toggleAllComp = function (boolean) {
		if (boolean) {

			var filtered = scope.filter(scope.companies, scope.companySearch);

			_.each(filtered, function (company) {
				scope.checkedCompanies[company.key] = false;
				scope.checkCompanies(company);
			});
		}	
		else {
			_.each(scope.companies, function (company) {
				scope.checkedCompanies[company.key] = true;
				scope.checkCompanies(company);
			});
		}
		scope.compAll = !scope.compAll;
	};

	//sort companies by name
	scope.ascendingComp = null;
	scope.sortComp = function () {
		if (!scope.ascendingComp) {
			scope.companies.sort(function (a,b){
				return a.value.name > b.value.name?1:-1;
			});
			scope.ascendingComp = true;
		} else {
			scope.companies.sort(function (a,b){
				return a.value.name < b.value.name?1:-1;
			});
			scope.ascendingComp = false;
		}
	};

	//-------------------------------------------------------ALL SITE FUNCTIONS

	//check/uncheck a site and get/remove its locations
	scope.checkSites = function (site) {
		if (scope.checkedSites[site.key] == true) {
			scope.checkedSites[site.key] = false;

			//remove all the locations that are assosiated with this site
			var siteId = site.value.refId;
			for (var i = 0; i < scope.locations.length; i++) {
				if (scope.locations[i].value.site == siteId) {
					//uncheck all locations associated with this site
					scope.checkedLocations[scope.locations[i].key] = true;
					scope.checkLocations(scope.locations[i]); 
					//take away from locations array
					scope.locations.splice(i,1);
					//revert none/all button
					scope.locAll = false;
					i -= 1;
				}
			}
		} 
		else if (scope.checkedSites[site.key] == false) {
			scope.checkedSites[site.key] = true;

			var keys = _.keys(scope.checkedSites);
			var refIdArr = [];
			_.each(scope.sites, function (site) {
				if (scope.checkedSites[site.key] == true) {
					refIdArr.push(site.value.refId);
				}
			});

			//POST locations with refId in refId
			scope.locGetter.list({getLocationLookupId: null, getCompanyLookupList: [], getSiteLookupList: refIdArr}, function (locations) {
				scope.locations = locations;

				//initiailize all checked locations with false
				for (var i = 0; i < scope.locations.length; i++) {
					var key = scope.locations[i].key;
					if (!(key in scope.checkedLocations)) {
						scope.checkedLocations[key] = false;
					} 
				}
			});
		}//end of else
	};

	//check/uncheck all sites
	scope.siteAll = false;
	scope.toggleAllSite = function (boolean) {
		if (boolean) {
			var filtered = scope.filter(scope.sites, scope.siteSearch);

			_.each(filtered, function (site) {
				scope.checkedSites[site.key] = false;
				scope.checkSites(site);
			});
		}
		else {
			_.each(scope.sites, function (site) {
				scope.checkedSites[site.key] = true;
				scope.checkSites(site);
			});
		}
		scope.siteAll = !scope.siteAll;
	};

	//sort sites by names
	scope.ascendingSite = null;
	scope.sortSite = function () {
		if (!scope.ascendingSite) {
			scope.sites.sort(function (a,b){
				return a.value.name > b.value.name?1:-1;
			});
			scope.ascendingSite = true;
		} else {
			scope.sites.sort(function (a,b){
				return a.value.name < b.value.name?1:-1;
			});
			scope.ascendingSite = false;
		}
	};


	//---------------------------------------------------ALL LOCATION FUNCTIONS

	//check/uncheck a location and get/remove its parameters
	scope.checkLocations = function (location) {
		if (scope.checkedLocations[location.key] == true) {
			scope.checkedLocations[location.key] = false;

			//remove all the parameters that are assosiated with this location
			for (var i = 0; i < scope.parameters.length; i++) {
				var locationId = location.value.refId;
				if (scope.parameters[i].location_id == locationId) {
					//uncheck all parameters associated with this location 
					scope.checkedParameters[scope.parameters[i].pid] = true;
					scope.checkParameters(scope.parameters[i]); 
					//take away from parameters array
					scope.parameters.splice(i,1);
					// revert none/all button
					scope.paramAll = false;
					i -= 1;
				}
			}
		} 
		else if (scope.checkedLocations[location.key] == false) {
			scope.checkedLocations[location.key] = true;

			var keys = _.keys(scope.checkedLocations);
			var refIdArr = [];
			_.each(scope.locations, function (location) {
				if (scope.checkedLocations[location.key] == true) {
					refIdArr.push(location.value.refId);
				}
			});

			//POST parameters with refId in refIdarr
			scope.parameters = [{description: 'Loading data from server..'}];
			scope.multiParamGetter.list({getLocationLookupList: refIdArr, getCompanyLookupList: [], getSiteLookupList: []}, function (parameters) {
				scope.parameters = parameters;
				//initiailize all checked locations with false
				for (var i = 0; i < scope.parameters.length; i++) {
					var key = scope.parameters[i].pid;
					if (!(key in scope.checkedParameters)) {
						scope.checkedParameters[key] = false;
					} 
				}
			});
		}
	}; 

	//check/uncheck all locations
	scope.locAll = false;
	scope.toggleAllLoc = function (boolean) {
		if (boolean) {
			var filtered = scope.filter(scope.locations, scope.locationSearch);

			var answer = confirm('You are attempting to select all ' + filtered.length +  ' locations.\nAre you sure you want to do this?');
			if (answer) {

				_.each(filtered, function (location) {
					scope.checkedLocations[location.key] = false;
					scope.checkLocations(location);
				});
				scope.locAll = !scope.locAll;
			}
		}
		else {
			_.each(scope.locations, function (location) {
				scope.checkedLocations[location.key] = true;
				scope.checkLocations(location);
			});	
			scope.locAll = !scope.locAll;
		}
	};

	//sort locations by name
	scope.ascendingLoc = null;
	scope.sortLoc = function () {
		if (!scope.ascendingLoc) {
			scope.locations.sort(function (a,b){
				return a.value.name > b.value.name?1:-1;
			});
			scope.ascendingLoc = true;
		} else {
			scope.locations.sort(function (a,b){
				return a.value.name < b.value.name?1:-1;
			});
			scope.ascendingLoc = false;
		}
	};

	//--------------------------------------------------ALL PARAMETER FUNCTIONS

	//check/uncheck a parameter and draw/remove it on the chart
	var configObj; //use this to get tag history using pid
	var initTop; //keeps window fixed when updating series
	scope.checkParameters = function (parameter) {
		initTop = $(window).scrollTop();

		if (scope.checkedParameters[parameter.pid] == true) {
			scope.checkedParameters[parameter.pid] = false;

			//this removes the unchecked parameter from chart
			_.each(myChart.series, function (series) {
				if(series.pid == parameter.pid) {
					series.remove();
				}
			});

		} 
		else if (scope.checkedParameters[parameter.pid] == false) {
			scope.checkedParameters[parameter.pid] = true;		

			pidToName[parameter.pid] = parameter.location.name + " - " + parameter.description;

			var start = scope.fromDate.getTime() + (1000*3600); //now plus 1 hour for safety
			var end = scope.toDate.getTime() + (1000*3600); //now minus 1 hour for safety
			// var end = (new Date()).getTime();
			// var start = end - (1000*3600*24*30*5); //5 months
			var step = calculateStep(start,end);
		
			configObj = {
				// start: JSON.stringify(new Date(start)),
				// end: JSON.stringify(new Date(end)),
				start: start,
				end: end,
				step: step,
				delta: 15.0,
				pid: parameter.pid
			};

			//get new data
			scope.history.get(configObj,{}, function (data) {
				var newSeries = createSeries(data);
				newSeries.data = sortDataByTime(newSeries.data);
				pidToRawData[parameter.pid] = newSeries.data;
				var currentSeries = myChart.addSeries(newSeries);
				currentSeries.pid = parameter.pid;
				lastUpdateTime();
			});
		}
	};

	//check/uncheck all parameters
	scope.paramAll = false;
	scope.toggleAllParam = function (boolean) {
		if(boolean) {
			var filtered = scope.filter(scope.parameters, scope.parameterSearch);

			var answer = confirm('You are attempting to select all ' + filtered.length +  ' parameters.\nAre you sure you want to do this?');
			if (answer) {

				_.each(filtered, function (parameter) {
					scope.checkedParameters[parameter.pid] = false;
					scope.checkParameters(parameter);
				});
				scope.paramAll = !scope.paramAll;
			}
		}
		else {
			//uncheck all params then remove from series
			_.each(scope.parameters, function (parameter) {
				scope.checkedParameters[parameter.pid] = true;
				scope.checkParameters(parameter);
			});
			scope.paramAll = !scope.paramAll;
		}
	};

	//emulates clicking and unclicking a location to re-fetch params
	scope.refreshParams = function () {
		_.each(scope.locations, function (location) {

			if (scope.checkedLocations[location.key] == true) {
				scope.checkLocations(location);
				scope.checkLocations(location);
			}
		});
	};

	//sort parameters by description
	scope.ascendingDes = null;
	scope.sortDescription = function () {
		if (!scope.ascendingDes) {
			scope.parameters.sort(function (a,b){
				return a.description > b.description?1:-1;
			});
			scope.ascendingDes = true;
		} else {
			scope.parameters.sort(function (a,b){
				return a.description < b.description?1:-1;
			});
			scope.ascendingDes = false;
		}
		scope.ascendingRes = null;
		scope.ascendingTime = null;
		scope.ascendingParamLoc = null;
	};

	//sort parameters by location
	scope.ascendingParamLoc = null;
	scope.sortParamLoc = function () {
		if (!scope.ascendingParamLoc) {
			scope.parameters.sort(function (a,b){
				return a.location.name > b.location.name?1:-1;
			});
			scope.ascendingParamLoc = true;
		} else {
			scope.parameters.sort(function (a,b){
				return a.location.name < b.location.name?1:-1;
			});
			scope.ascendingParamLoc = false;
		}
		scope.ascendingRes = null;
		scope.ascendingTime = null;
		scope.ascendingDes = null;
	};

	//sort parameters by result
	scope.ascendingRes = null;
	scope.sortResult = function () {
		if (!scope.ascendingRes) {
			scope.parameters.sort(function (a,b){
				return a.result > b.result?1:-1;
			});
			scope.ascendingRes = true;
		} else {
			scope.parameters.sort(function (a,b){
				return a.result< b.result?1:-1;
			});
			scope.ascendingRes = false;
		}
		scope.ascendingDes = null;
		scope.ascendingTime = null;
		scope.ascendingParamLoc = null;
	};

	//sort parameters by time
	scope.ascendingTime = null;
	scope.sortTime = function () {
		if (!scope.ascendingTime) {
			scope.parameters.sort(function (a,b){
				return a.last_update > b.last_update?1:-1;
			});
			scope.ascendingTime = true;
		} else {
			scope.parameters.sort(function (a,b){
				return a.last_update< b.last_update?1:-1;
			});
			scope.ascendingTime = false;
		}
		scope.ascendingDes = null;
		scope.ascendingRes = null;
		scope.ascendingParamLoc = null;
	};


	//-------------------------------------------------------ALL OTHER FUNCTIONS


	function createChart () {
				var start = new Date().getTime() - (1000*60*60*5) ; //time when the chart is created
			   	myChart = new Highcharts.StockChart({
			    	chart: {
				        	height: 500
				        	,renderTo: chart
				            ,type: 'spline'
				            ,zoomType: 'x'
				            ,events: {
				            	load: function() {
									$(window).scrollTop(initTop);
				            		
				            		// setInterval(function() {
				            		// 	var start = new Date().getTime()-(1000*60); //last minute
				            		// 	var end = new Date().getTime();
				            		// 	loadNewData(start,end);
				            		// 	lastUpdateTime();
				            		// }, 1000*60);
				            	}
				            }
							,plotOptions: {
								areaspline: {
									fillOpacity: 0.9
								}
							}      
				    }
				    ,legend: {
				    	enabled: true
				    }
			    	,rangeSelector: {
			    		buttonTheme: {
				    		fill: 'none',
				    		stroke: 'none',
				    		'stroke-width': 0,
				    		r: 8,
				    		style: {
				    			color: '#039',
				    			fontWeight: 'bold'
				    		},
				    		states: {
				    			hover: {
				    			},
				    			select: {
				    				fill: '#039',
				    				style: {
				    					color: 'white'
				    				}
				    			}
				    		}
				    	},
				    	inputBoxBorderColor: 'gray',
				    	inputBoxWidth: 120,
				    	inputBoxHeight: 18,
				    	inputStyle: {
				    		color: '#039',
				    		fontWeight: 'bold'
				    	},
				    	labelStyle: {
				    		color: 'silver',
				    		fontWeight: 'bold'
				    	}

			    		,buttons: [{
			    			type: 'day',
			    			count: 1,
			    			text: "1D"
			    		},{
			    			type: 'day',
			    			count: 5,
			    			text: "5D"
			    		},{
			    			type: 'month',
			    			count: 1,
			    			text: "1M"
			    		},{
			    			type: 'month',
			    			count: 3,
			    			text: "3M"
			 	 		},{
			    			type: 'ytd',
			    			text: "YTD"
			    		},{
			    			type: 'month',
			    			count: 6,
			    			text: '6M'
			    		},{
			    			type: 'year',
			    			count: 1,
			    			text: "1Y"
			    		},{
			    			type: 'year',
			    			count: 2,
			    			text: '2Y'
			    		},{
			    			type: "all",
			    			text: "All"
			    		}]
			    		,inputEnabled: false
			    		,selected: 0
			    	}
			    	,navigator : {
						adaptToUpdatedData: false
					}
					,scrollbar: {
						liveRedraw: false,
					}
			    	,xAxis: {
			    		type: 'datetime',
			    		events: {
			    			afterSetExtremes: function (e) {
			    				scope.fromDate = new Date(e.min);
			    				scope.toDate = new Date(e.max);

			    				if(!firstLoad) {
				    				loadNewData(e.min,e.max);
								} firstLoad = false;
			    			}
			    		}
			    		,minRange: 1000*30 //lowest chart can go is 30 second range
			    	}
			    	
			        ,subtitle: {
			        	text: 'Last Chart Refresh: ' + Highcharts.dateFormat(null, new Date(start))
			        }
			        ,series: mySeries
			    });
	}

	function calculateStep(start,end) {
		var step;
		var diff = end - start;
		var points = 101;
		
		if (diff > 0){
			step = Math.floor((diff/1000)/points);
        	if (step < 30){
        		step = 30;
        	}
		}
		return step;
	}	

	function loadNewData(start, end, step) {
		var oldData, newData, mergedData, configObj;
		var end = end;
		var start = start;
		var step = step;

		if (!step) {
			step = calculateStep(start,end);
		}

		//get new data for each pid
		_.each(scope.parameters, function (parameter) {
			
			if (scope.checkedParameters[parameter.pid] == true) {

				if (!end) {
					configObj = {
						// start: JSON.stringify(new Date(start)),
						start: start,
						step: step,
						delta: 15.0,
						pid: parameter.pid
					}	
				} else {
					configObj = {
						// start: JSON.stringify(new Date(start)),
	     //                end: JSON.stringify(new Date(end)),
						start: start,					
						end: end,
						step: step,
						delta: 15.0,
						pid: parameter.pid
					}
				}	
				
				myChart.showLoading('Fetching data from server..');
				scope.history.get(configObj,{}, function (data) {

					if (data) {
						oldData = angular.copy(pidToRawData[parameter.pid]);
						newData = createSeries(data).data;
						mergedData = oldData.concat(newData);
						mergedData = sortDataByTime(mergedData);
						pidToRawData[parameter.pid] = mergedData;

						_.each(myChart.series, function (series) {
							if (series.pid == parameter.pid) {
								series.setData(mergedData, false, false,false);
								myChart.redraw();
							}
						});
					}

					myChart.hideLoading();	
				});
			}
		});
	}

	function sortDataByTime (data) {
		return data.sort(function (a,b) {
			return a[0] > b[0]?1:-1;
		});
	}

	function createSeries (resourceList) {
		var dataArray = [];
		var pid = resourceList[0].pid;
		
		for (var i=0; i < resourceList.length; i++) {
			// UTC time for x axis, value for y axis
            var time = Date.parse(resourceList[i].time) - (1000*3600*5);
			var coefficient = 1000; //currently rounds time to nearest second
			var nearestSecond = new Date(Math.round(time/coefficient)*coefficient).getTime();
			var value = resourceList[i].val

			dataArray.push([nearestSecond,value]);
		}
		var series = {
			'name': pidToName[pid],
			'data': dataArray
		};
		
		return series;
	}

	function lastUpdateTime () {
		var start = new Date().getTime() - (1000*60*60*5);
		myChart.setTitle(null,{
			text: "Last Chart Refresh: " + Highcharts.dateFormat(null, new Date(start))
		});
	}

	scope.setStart = function (startTime) {
		var time = startTime.getTime();

		//if start is > end, set start to a day before end 
		var endTime = scope.toDate.getTime(); 
		if (time > endTime) {
			time = endTime - (1000*3600*24);
		}

		myChart.xAxis[0].setExtremes(time);
	};

	scope.setEnd = function (endTime) {
		var time = endTime.getTime();

		//if end is < start, set end to a day after start 
		var startTime = scope.fromDate.getTime();
		if (time < startTime) {
			time = startTime + (1000*3600*24);
		}

		//if end > last point, set end to last point
		_.each(myChart.series,function (series) {
			var maxTime = series.xData[series.xData.length-1];
			if (time > maxTime) {
				time = maxTime;
			}
		});

		myChart.xAxis[0].setExtremes(null, time);
	};

	scope.changeTime = function (customRange) {
		if (scope.customNum) {
			var time = scope.customNum;
			var thePast;
			
			if (customRange == 'mi') {
				time *= 1000*60;
			} else if (customRange == 'h') {
				time *= 1000*3600;
			} else if (customRange == 'd') {
				time *= 1000*3600*24;
			} else if (customRange == 'mo') {
				
				var tempEnd = scope.toDate;
				var difference = tempEnd.getMonth() - time;
				while (difference < 0) {
					tempEnd.setFullYear(tempEnd.getFullYear()-1);
					time -= 12;
					difference = tempEnd.getMonth()-time;
				}
				tempEnd.setMonth(tempEnd.getMonth()-time);
				time = scope.toDate.getTime() - tempEnd.getTime();
			}

			//in utc time
			thePast = scope.toDate.getTime() - time;

			myChart.xAxis[0].setExtremes(thePast);
		}
	};

	scope.reset = function () {
		scope.customRange = null;
	}

	//automatically checks all the relevant boxes when you enter page with a pid
	function trailCheck() {
		myChart.showLoading('Initializing chart..');
		//post the onpingtagcombined for the initial pid
		scope.pidToTagCombined.list(scope.getParameterInfoList,function (data) {
			var companyId = data[0].company;
			var siteId = data[0].site;
			var locationId = data[0].location_id;
			var parameterId = data[0].pid;
			
			//get all the companies					
			scope.companyGetter.get({},{}, function (companies) {
				scope.companies = companies;

				//intialize all companies to false, and then check the one
				_.each(scope.companies, function (company) {
					var key = company.key;
					if (!(key in scope.checkedCompanies)) {
						scope.checkedCompanies[key] = false;
					}
					if (company.value.refId == companyId) {	
						scope.checkedCompanies[key] = true;
					}						
				});

				//when companies are loaded, get the sites
				scope.siteGetter.get({getCompanyLookupList: companyId, getSiteLookupId: null},{}, function (sites) {
					scope.sites = sites;

					//intialize all sites to false, and then check the one
					_.each(scope.sites, function (site) {
						var key = site.key;
						if (!(key in scope.checkedSites)) {
							scope.checkedSites[key] = false;
						}
						if (site.value.refId == siteId) {
							scope.checkedSites[key] = true;
						}
					});

					//when sites are loaded, post the locations
					scope.locGetter.list({getLocationLookupId: null, getCompanyLookupList: [], getSiteLookupList: [siteId]}, function (locations) {
						scope.locations = locations;
						
						//initialize all locations to false and then check the one
						_.each(scope.locations, function (location) {
							var key = location.key;
							if (!(key in scope.checkedLocations)) {
								scope.checkedLocations[key] = false;
							}
							if (location.value.refId == locationId) {
								scope.checkedLocations[key] = true;
								myChart.setTitle({text: location.value.name + " - " + data[0].description});
							}
						});

						//when location are loaded, post the parameters
						scope.parameters = [{description: 'Loading data from server..'}];
						scope.multiParamGetter.list({getLocationLookupList: [locationId], getCompanyLookupList: [], getSiteLookupList: []}, function (parameters) {
							scope.parameters = parameters;

							//intialize all parameters to false and then check the one
							_.each(scope.parameters, function (parameter) {
								var key = parameter.pid;
								if (!(key in scope.checkedParameters)) {
									scope.checkedParameters[key] = false;
								}
								if (key == parameterId){
									scope.checkedParameters[parameter.pid] = true;
									pidToName[parameter.pid] = parameter.location.name + " - " +  parameter.description;

									//add the initial data to the chart
									var newSeries = createSeries(initialData);
									newSeries.data = sortDataByTime(newSeries.data);
									var currentSeries = myChart.addSeries(newSeries);
									pidToRawData[parameter.pid] = newSeries.data;
									currentSeries.pid = parameterId;

									myChart.hideLoading();
								}
							});
						});//end get parameters
					});//end get locations
				});//end get sites
			});//end get company
		});//end post tagcombined
	}//end trailcheck
	
};//end link


			

	