/*jslint node: true */
'use strict';

function cas(config, definitions) {
	
	// load transport
	var TransportManager = require('./transportmanager');
	config.transportManager = new TransportManager();
	config.transportManager.init(config);

	// load sources
	var SourceManager = require('./sourcemanager');
	config.sourceManager = new SourceManager();
	config.sourceManager.init(config, definitions);


	// init api server
	var APIServer = require('./apiserver');
	config.apiServer = new APIServer(config);

}

module.exports = cas;
