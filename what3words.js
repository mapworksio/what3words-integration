// please replace the API key below with your own what3words API key
var w3wApiKey='W5UMPVKL';

w3w = {
	minScale: 70,
	zoomScale: 5000,

	/**
	 * Initialise the Events
	 */
	init: function() {
		map.setTakeFocus(false);
		map.setMinScale(w3w.minScale);
		// create the layer that shows our main w3w point
		w3w.layer = new Studio.core.entity.TreeVectorLayerEntity({
			visible: true
		}, {
			map: map
		});
		map.getTree().add(w3w.layer);

		var layerStyles = new Studio.core.entity.LayerStylesEntity({
			w3wStyle2: {
				default: {
					pointFill: '#e6323e',
					pointWidth: 8
				},
				order: 2
			},
			w3wStyle1: {
				default: {
					pointFill: '#000000',
					pointOpacity: 0,
					pointWidth: 18,
					pointLineWidth: 2,
					pointLineFill: '#e6323e'
				},
				order: 1
			}
		});
		w3w.layer.setStyles(layerStyles);
		w3w.pt = null;

		// create the layer that will show the surrounding words
		w3w.surroundingLayer = new Studio.core.entity.TreeVectorLayerEntity({
			visible: true,
			labelled: true,
			styles: {
				"#": {
					"default": {
						pointFill: 'red',
						pointWidth: 8,
						labelFont: "Sans-Serif",
						labelSize: [12],
						labelTemplate: '|title|'
					}
				}
			},
		}, {
			map: map
		});
		w3w.surroundingLayer.setFields([{
			name: "title",
			title: "Title", 
			type: Studio.core.entity.LayerFieldEntity.TypeMap.VARCHAR
		}]);

		map.getTree().add(w3w.surroundingLayer);

		// listen to the mouse click event to find the w3w value
		map.listenTo(map, 'feature:mouseclick', function(ev) {
			w3w.inProgress(true);
			var coords = map.getCoordinates(ev.getX(), ev.getY());

			w3w.request('reverse', {
					coords: coords[1] + "," + coords[0]
				},
				function(data, status) {
					$('#txtWhat3Words')[0].value = data.words;
					w3w.inProgress(false);
				});
			w3w.pointer(coords);
		});



		// Get the coordinates from 3 words, checking to make sure the word pattern is correct	
		$('#btnGo').click(function(ev) {
			var word = $('#txtWhat3Words')[0].value;
			var pattern = /\w.\w.\w/g;
			
			// check pattern
			if (pattern.test(word)) {
				w3w.inProgress(true);
				w3w.request('forward', {
						addr: word
					},
					function(data, status) {
						// check for valid response
						if(data.status.status == 200 && data.status.code == null){
							var geom = data.geometry;
							var bounds = data.bounds;
							map.setViewCenter(geom.lng, geom.lat, w3w.zoomScale); //Zoom to the point.
							w3w.pointer([geom.lng, geom.lat]);
						}
						// handle errors
						else{
							alert("Error retrieving what3words location. "+data.status.message);
						}
						w3w.inProgress(false);
					}
				);
			} else {
				alert('No words specified. Must be in the format of word1.word2.word3');
			}
		});
		
		// cancel the textbox submission on enter and trigger the w3w retrieval instead
		$(document).on("keypress", "input", function(event) {
			if (event.keyCode == 13) {
				event.preventDefault();
				$("#btnGo").click();
				return false;
			}
		});

		//Trigger request to draw the surrounding points
		$('#btnSurround').click(function(ev) {
			if (w3w.pt != null) {
				// zoom on last clicked position 
				map.setViewCenter(w3w.pt.getX(), w3w.pt.getY(), w3w.minScale);
			} else {
				// zoom to the middle of the screen
				var viewCenter = map.getViewCenter();
				w3w.pointer(viewCenter);
				map.setViewCenter(viewCenter[0], viewCenter[1], w3w.minScale);
			}
			
			// use our current view as the input for the what3words grid query
			var bbox = map.getViewExtent().getBounds().getBoundsAsArray();
			w3w.inProgress(true);
			w3w.request('grid', {
				bbox: bbox.reverse().toString()
			}, function(data, status) {
				if (data.lines) {
					w3w.drawSurrounding(data.lines);
				} else {
					alert(data.status.message);
				}
			});
		});
	},

	/**
	 * Helper function to call What 3 Words API
	 * @param String type Can be on of reverse, forward, or grid.
	 * @param Object data The data required for the call. @see https://docs.what3words.com/api/v2/#description
	 * @param Function callback A callback function.
	 */
	request: function(type, data, callback) {
		if (!type || !data) {
			return "No parms!";
		}

		def = {
			display: 'full',
			format: 'json',
			key: w3wApiKey
		}

		return $.ajax({
			url: 'https://api.what3words.com/v2/' + type,
			data: _.extend(def, data),
			success: callback || function(data, status) {
				console.log(status, data);
			}
		})
	},

	// Draw the pointer on the map at the given coordinates [x,y]
	pointer: function(coords) {
		if (w3w.pt == null) {
			w3w.pt = map.createPoint(coords[0], coords[1], w3w.layer);
		} else {
			w3w.pt.setCoordinates(coords[0], coords[1]);
		}
		w3w.layer.redraw();
	},
	
	// Helper method to set the busy spinner
	inProgress: function(busy) {
		if (busy)
			$('#spinner').show();
		else
			$('#spinner').hide();
	},
	
	// Draw the surrounding points given the w3w grid 
	drawSurrounding: function(grid) {
		//Remove existing points
		w3w.surroundingLayer.reload();

		// create array of longitude and latitude points based on the w3w grid
		var longs = [];
		var lats = [];

		for (i = 0; i < grid.length - 1; i++) {
			// check if this is a latitude line or longitude line and push to the appropriate array
			if (grid[i].start.lat == grid[i].end.lat) {
				lats.push(grid[i].start.lat);
			} else if (grid[i].start.lng == grid[i].end.lng) {
				longs.push(grid[i].start.lng);
			}

			// draw lines for debugging
			//map.createPolyline([grid[i].start.lng, grid[i].end.lng], [grid[i].start.lat, grid[i].end.lat], 2, w3w.surroundingLayer);
		}

		// Create Points with a slight offset so that we dont run into boundary problems
		var points = []
		var offset = 0.000001;
		for (i = 0; i < longs.length; i++) {
			for (j = 0; j < lats.length; j++) {
				points.push([lats[j] - offset, longs[i] + offset]);
			}
		}

		// retrieve the words for each point
		var promises = points.map(function(point) {
			return w3w.request('reverse', {
					coords: point.toString()
				},
				function(data, status) {
					// draw each of them on the map 
					map.createPoint(data.geometry.lng, data.geometry.lat, w3w.surroundingLayer)
						.setFields({
							Title: data.words
						});
					w3w.surroundingLayer.redraw();
				});
		});

		//End spinner when all drawn
		$.when.apply($, promises).then(function() {
			w3w.inProgress(false);
		});
	}
}

function getParameterByName(name) {
    var url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

