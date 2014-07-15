
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

var analysisDirectiveLink = function(scope,element,attrs) {
	"use strict";

	scope.companies = []; //all the companies that the resource got
	scope.sites = [];
	scope.locations = [];
	scope.parameters = [];

	scope.checkedCompanies = {}; //which ones have so far been selected
	scope.checkedSites = {};
	scope.checkedLocations = {};
	scope.checkedParameters = {};
	scope.checkedParametersY2 = {}; //checked in second y-axis

	scope.fromDate; //current min time on chart
	scope.toDate; //current max time on chart

	var pidToName = {}; //keeps track of pids with their names
	var pidToRawData = {}; //keeps all the raw data in the series for that pid
	var mySeries = []; //Chart's series. Do not refer to this to get data.
	var myChart; //instance of highstock
	var firstLoad = true;
	var initialData;
	var initTop;


	var initLoad = function () {
		//config object when the chart first loads
		var current = (new Date()).getTime();
		var back = current - (1000*3600*24*30); //30 days
		var initialStep = calculateStep(back,current);

		back = JSON.stringify(new Date(back));
		current = JSON.stringify(new Date(current));

		var initialConfigObj = {
			start:back,
			end:current,
			step: initialStep,
			delta: 15.0,
			pid: scope.getParameterInfoList
		}

		scope.history.get(initialConfigObj, function (data) {	
			initialData = data;

			createChart();

			if (initialData.length != 0) {
				trailCheck();	
			} 
			else { //if no pid, then load empty chart with all the companies
				scope.companyGetter.get({},{}, function (companies) {
					scope.companies = companies;
					//intialize all companies to false
					_.each(scope.companies, function (company) {
						scope.checkedCompanies[company.key] = false;
					});
				});
			}
		});
	};

	initLoad();

	//-------------------------------------------------------ALL OTHER FUNCTIONS

	function calculateStep(start,end) {
		var step;
		var diff = end - start;
		var points = 70; //how many points do you want between start and end
		
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
		var navData;

		if (!step) {
			step = calculateStep(start,end); //100 points
		}

		//get new data for each pid
		_.each(scope.parameters, function (parameter) {

			if (scope.checkedParameters[parameter.pid] == true) {

				var min = JSON.stringify(new Date(start));
				var max = JSON.stringify(new Date(end));

				configObj = {
					start: min,					
					end: max,
					step: step,
					delta: 15.0,
					pid: parameter.pid
				}			
				
				myChart.showLoading('Fetching data from server..');
				scope.history.get(configObj,{}, function (data) {

					if (data.length != 0 && typeof data != 'undefined') {
						oldData = angular.copy(pidToRawData[parameter.pid]);
						newData = createSeries(data).data;
						mergedData = oldData.concat(newData);
						mergedData = sortDataByTime(mergedData);
						pidToRawData[parameter.pid] = mergedData;	

						var seriesToUpdate = [];
						_.each(myChart.series, function (series) {
							if (series.pid == parameter.pid) {
								seriesToUpdate.push(series);
							}
						});

						_.each(seriesToUpdate, function (series) {
							series.setData(mergedData, false, false,true);
						});

						myChart.redraw();
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

	function createSeries (resourceList, secondY) {

		if (!secondY){
			var secondY = false;
		}

		var dataArray = [];
		var pid = resourceList[0].pid;
		
		for (var i=0; i < resourceList.length; i++) {
			// UTC time for x axis, value for y axis
            var time = Date.parse(resourceList[i].time) - (1000*3600 * (new Date().getTimezoneOffset()/60));
			var coefficient = 1000; //currently rounds time to nearest second
			var nearestSecond = new Date(Math.round(time/coefficient)*coefficient).getTime();
			var value = resourceList[i].val

			dataArray.push([nearestSecond,value]);
		}

		var series = {
			'name': pidToName[pid],
			'data': dataArray,
			'marker': {
				enabled: true,
				radius: 3
			}
		};

		//if making series for Y2, then add some extra things
		if (secondY) {
			series['name'] = series['name'] + '-Y2';
			series['yAxis'] = 1;
			series['dashStyle'] = 'LongDash';
		}
		
		return series;
	}

	function lastUpdateTime () {
		var start = new Date().getTime() - (1000*3600*(new Date().getTimezoneOffset()/60));
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

		//if end < start, set end to a day after start 
		var startTime = scope.fromDate.getTime();
		if (time < startTime) {
			time = startTime + (1000*3600*24);
		}

		// //if end > last point, set end to last point
		// _.each(myChart.series,function (series) {
		// 	var maxTime = series.xData[series.xData.length-1];
		// 	if (time > maxTime) {
		// 		time = maxTime;
		// 	}
		// });

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

	function createChart () {
		//time when the chart is created
		var start = new Date().getTime() - (1000*3600 * (new Date().getTimezoneOffset()/60)); 
	   	myChart = new Highcharts.StockChart({
	    	chart: {
		        	height: 450
		        	,renderTo: chart
		            ,type: 'spline'
		            ,zoomType: 'x'
		            ,events: {
		            	load: function() {
							$(window).scrollTop(initTop);

		            		setInterval(function() {
		            			var end = new Date().getTime();
		            			var start = end -(1000*60*3); //load data for last 3 minutes
		            			loadNewData(start,end);
		            			lastUpdateTime();
		            		}, 1000*60);
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

			    		loadNewData(e.min,e.max);	    					
	    			}
	    		}
	    		,minRange: 1000*30 //lowest chart can go is 30 second range
	    	}
	    	,yAxis: [{
	    		opposite:false
	    	},{
	    		style: {
                    color: Highcharts.getOptions().colors[1]
                }
	    	}]
	        ,subtitle: {
	        	text: 'Last Chart Refresh: ' + Highcharts.dateFormat(null, new Date(start))
	        }
	        ,series: mySeries
	    });
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
								if (!(key in scope.checkedParametersY2)){
									scope.checkedParametersY2[key] = false;
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
									currentSeries.whichYAxis = 1;

									
									//hack: delete default navigator,
									//load new chart with same data as the series in the navigator axis
									myChart.series[1].remove();
									var navSeries = makeNavSeriesFrom(currentSeries);
									navSeries.whichYAxis = 1;
								
									// resizes the initial viewing window, 3 days
									var now = new Date().getTime();
									var past = now - (1000*3600*24*3);
									myChart.xAxis[0].setExtremes(past, now);

									myChart.hideLoading();
								}
							});
						});//end get parameters
					});//end get locations
				});//end get sites
			});//end get company
		});//end post tagcombined
	}//end trailcheck

	//pass newSeries because it has raw
	function makeNavSeriesFrom(currentSeries) {
		var navSeries = myChart.addSeries({
			name:'nav',
			xAxis: 1,
			yAxis: 2, //this must be an axis you have not defined yet
			type: 'spline',
			enableMouseTracking: false,
			data: pidToRawData[currentSeries.pid],
			showInLegend: false,
			color: currentSeries.color
		});
		navSeries.pid = currentSeries.pid;
		return navSeries;
	}

	scope.selectHidden = false;
	scope.hideSelect = function () {
		console.log('hi');
		if (scope.selectHidden == false) {
			$('#selectRow').css('display','none');
		} else if (scope.selectHidden == true) {
			$('#selectRow').css('display','block');
		}
		scope.selectHidden = !scope.selectHidden;
	};

	var originalHeight = 450;
	scope.resizeGraph = function (number) {
		if (number == 0) {
			//+ button
			myChart.setSize(null, originalHeight*=1.1);
		} else if (number == 1) {
			//- button
			myChart.setSize(null, originalHeight*=0.9);
		} else if (number == 2) {
			//reset button
			myChart.setSize(null, 450);
		}
	}; 

	//--------------------------------------------------ALL PARAMETER FUNCTIONS

	//check/uncheck a parameter and draw/remove it on the chart
	scope.checkParameters = function (parameter, secondY) {
		initTop = $(window).scrollTop(); //keeps window fixed when updating series

		//default
		if (!secondY) {
			var secondY = false;
		}

		if (!parameter.y1Loading) {

			//checking first y-axis
			if (secondY == false) {
				if (scope.checkedParameters[parameter.pid] == true) {
					scope.checkedParameters[parameter.pid] = false;

					//this removes Y1 its nav from chart
					var toRemove = []
					_.each(myChart.series, function (series) {
						if(series.pid == parameter.pid) {
							toRemove.push(series);
						}
					});
					_.each(toRemove, function (series) {
						if (series.whichYAxis == 1) {
							series.remove();
						}
					});
				} 
				else if (scope.checkedParameters[parameter.pid] == false) {
					scope.checkedParameters[parameter.pid] = true;

					_.each(toRemove, function (series) {	
							series.remove();
					});

					pidToName[parameter.pid] = parameter.location.name + " - " + parameter.description;

					var start = (new Date()).getTime() - (1000*3600*24*30);
					var end = (new Date()).getTime();
					var step = calculateStep(start,end);

					start = JSON.stringify(new Date(start));
					end = JSON.stringify(new Date(end));

					var configObj = {
						start: start,
						end: end,
						step: step,
						delta: 15.0,
						pid: parameter.pid
					};

					//adding new series to the chart
					parameter.y1Loading = true;
					scope.history.get(configObj,{}, function (data) {
						if (typeof data != 'undefined' && data.length != 0) {

							var newSeries = createSeries(data); //make series with new data
							newSeries.data = sortDataByTime(newSeries.data); //sort time
							pidToRawData[parameter.pid] = newSeries.data; //cache it
							var currentSeries = myChart.addSeries(newSeries); //add it to chart
							currentSeries.pid = parameter.pid;
							currentSeries.whichYAxis = 1;
							var navSeries = makeNavSeriesFrom(currentSeries);
							navSeries.whichYAxis = 1;

							parameter.y1Loading = false;
							lastUpdateTime();
						}
					});	
				} //end of else
			} // end checking first y axis
		} //end checking y1Loading

		if (!parameter.y2Loading) {
			//checking second y axis
			if (secondY == true) {
				if (scope.checkedParametersY2[parameter.pid] == true) {
					scope.checkedParametersY2[parameter.pid] = false;

					//this removes Y2 and its nav from chart
					var toRemove = []
					_.each(myChart.series, function (series) {
						if(series.pid == parameter.pid) {
							toRemove.push(series);
						}
					});
					_.each(toRemove, function (series) {
						if (series.whichYAxis == 2) {
							series.remove();
						}
					});
				} 
				else if (scope.checkedParametersY2[parameter.pid] == false) {
					scope.checkedParametersY2[parameter.pid] = true;

					pidToName[parameter.pid] = parameter.location.name + " - " + parameter.description;

					//grabs data from now to 30 days back
					var start = (new Date()).getTime() - (1000*3600*24*30);
					var end = (new Date()).getTime();
					var step = calculateStep(start,end);

					start = JSON.stringify(new Date(start));
					end = JSON.stringify(new Date(end));

					var configObj = {
						start: start,
						end: end,
						step: step,
						delta: 15.0,
						pid: parameter.pid
					};


					//adding new series to the chart
					parameter.y2Loading = true;
					scope.history.get(configObj,{}, function (data) {
						if (typeof data != 'undefined' && data.length != 0) {

							var newSeries = createSeries(data, true); //make series with new data
							newSeries.data = sortDataByTime(newSeries.data); //sort time
							pidToRawData[parameter.pid] = newSeries.data; //cache it
							var currentSeries = myChart.addSeries(newSeries); //add it to chart
							currentSeries.pid = parameter.pid;
							currentSeries.whichYAxis = 2;
							var navSeries = makeNavSeriesFrom(currentSeries);
							navSeries.whichYAxis = 2;

							parameter.y2Loading = false;
							lastUpdateTime();
						}
					});	
				} //end of else
			} //end of checking second y axis
		}// end checking y2Loading
	};

	//check/uncheck all parameters
	scope.paramAll = false;
	scope.toggleAllParam = function (boolean) {
		if(boolean) {

			var filtered = scope.filter(scope.parameters, scope.parameterSearch);

			if (filtered.length > 10) {
				var answer = confirm('You are attempting to select all ' + filtered.length +  ' parameters.\nAre you sure you want to do this?');
			} else {
				answer = true;
			}

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

	//check/uncheck all y2 parameters
	scope.paramY2All = false;
	scope.toggleAllY2Param = function (boolean) {
		if(boolean) {

			var filtered = scope.filter(scope.parameters, scope.parameterSearch);

			if (filtered.length > 10) {
				var answer = confirm('You are attempting to select all ' + filtered.length +  ' parameters.\nAre you sure you want to do this?');
			} else {
				answer = true;
			}

			if (answer) {
				_.each(filtered, function (parameter) {
					scope.checkedParametersY2[parameter.pid] = false;
					scope.checkParameters(parameter,true);
				});
				scope.paramY2All = !scope.paramY2All;
			}
		}
		else {
			//uncheck all params then remove from series
			_.each(scope.parameters, function (parameter) {
				scope.checkedParametersY2[parameter.pid] = true;
				scope.checkParameters(parameter,true);
			});
			scope.paramY2All = !scope.paramY2All;
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

	//sort parameters by pid
	scope.ascendingPid = null;
	scope.sortPid = function () {
		if (!scope.ascendingPid) {
			scope.parameters.sort(function (a,b){
				return a.pid > b.pid?1:-1;
			});
			scope.ascendingPid = true;
		} else {
			scope.parameters.sort(function (a,b){
				return a.pid < b.pid?1:-1;
			});
			scope.ascendingPid = false;
		}
		scope.ascendingDes = null;
		scope.ascendingRes = null;
		scope.ascendingTime = null;
		scope.ascendingParamLoc = null;
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

		scope.ascendingPid = null;
		scope.ascendingRes = null;
		scope.ascendingTime = null;
		scope.ascendingParamLoc = null;
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
		scope.ascendingPid = null;
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
		scope.ascendingPid = null;
		scope.ascendingDes = null;
		scope.ascendingRes = null;
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
		scope.ascendingPid = null;
		scope.ascendingRes = null;
		scope.ascendingTime = null;
		scope.ascendingDes = null;
	};


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
					scope.checkedParameters[scope.parameters[i].pid] = true; //uncheck Y1
					scope.checkParameters(scope.parameters[i]); 
					scope.checkedParametersY2[scope.parameters[i].pid] = true; //uncheck Y2
					scope.checkParameters(scope.parameters[i],true);
					//take away from parameters array
					scope.parameters.splice(i,1);
					// revert none/all button
					scope.paramAll = false;
					i -= 1; //we decrement so we don't skip an index from splicing
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
					if (!(key in scope.checkedParametersY2)){
						scope.checkedParametersY2[key] = false;
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

			if (filtered.length > 10) {
				var answer = confirm('You are attempting to select all ' + filtered.length +  ' locations.\nAre you sure you want to do this?');
			} else {
				answer = true;
			}

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


};//end link