"use strict";

// source manager singleton
function SourceManager() {
	
	this.patternByName = {};
	this.config = {};
}

// configure source manager
SourceManager.prototype.init = function(config, definitions) {
	// [
	//        require('./sources/live'),
	//        require('./sources/selfridges')
	//    ]
	this.config = config;
	this.configured = true;
	// pre-build the regexp for each pattern
	for (var i = 0; i < definitions.length; i++) {
		for (var j = 0; j < definitions[i].length; j++) {
			this.patternByName[definitions[i][j].pattern] = definitions[i][j];
		}
	}

};

// get a source by name
// the path is an array of the route taken to get here
SourceManager.prototype.get = function(name, paths, callback, checkPublish) {
	name = name.toLowerCase();

	var match;
	var definition = this.patternByName[name];
	if (definition && !definition.regexp) {
		// function found by name
		match = [name];
	}

	// run the source creation function
	try {
		source = definition.handler.call(this, name, match);
	} catch (err) {
		source = null;
		err.kind = err.kind || 'definition';
		err.source = err.source || name;
		console.error('Error running pattern function ' + definition.pattern, err);
	}

	// init and get from this source
	source.init(this.config, function() {
		source.get(paths, callback);
	});

};

// export a SourceManager singleton
module.exports = SourceManager;