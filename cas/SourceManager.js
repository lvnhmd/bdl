/*jslint node: true */
'use strict';
// var utils = require('./utils');

// source manager singleton
function SourceManager() {
    this.patternByName = {};
    this.config = {};
    this.sources = {};
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

    // look for existing source in cache
    var source = this.sources[name];

    if (!source) {
        // if no existing source try to find a source creation function by name
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

        if (source) {
            source.pattern = definition.pattern;
            source.publish = definition.publish;
            console.log('New ' + (source.publish ? 'published ' : '') + 'source created for ' + source.name);

            // add to this source manager
            this.sources[source.name] = source;
        }
    }

    // init and get from this source
    source.init(this.config, function() {
        source.get(paths, callback);
    });

};

// export a SourceManager singleton
module.exports = SourceManager;