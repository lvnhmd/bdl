"use strict";

function cas(config, definitions) {
	
	// load transport
	var Transport = require('./transport');
	config.transportManager = new Transport();
	config.transportManager.init(config);

	// load sources
	var SourceManager = require('./sourcemanager');
	config.sourceManager = new SourceManager();
	config.sourceManager.init(config, definitions);


	// init api server
	var APIServer = require('./apiserver');
	config.apiServer = new APIServer(config, function(){
		
	});

}

module.exports = cas;
