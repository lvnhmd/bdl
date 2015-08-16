/*jslint node: true */
'use strict';
var url = require('url');
// var zlib = require('zlib');
var utils = require('./utils');
var http_status_codes = require('./httpstatuscodes.json');
require('colors');

function APIServer(config, cb) {
    
    var apiServer = this;
    
    this.config = config;
    this.server = require('http').createServer();
    
    this.server.on('request', function(request, response) {
        new APIServerConnection(apiServer, request, response);
    });

    this.server.listen(config.port, function(err) {
        if (err) {
            throw err;
        }

        console.log(
            'Server started : ' +
            ' Env : '  + config.environment +
            ' Node : ' + config.serverName +
            ' Port : ' + config.port);

        if (typeof cb === 'function') {
            cb();
        }
    });
}

// An individual connection
function APIServerConnection(server, request, response) {
    this.server = server;
    this.response = response;

    // split up path
    var path = url.parse(request.url).path.split('/');
    this.root = path[1];
    this.apiName = path.slice(2).join('/');

    return this.getData(this.apiName);
}

// get the data from the source manager and return it to the connection 
APIServerConnection.prototype.getData = function(apiName, cb) {
    var apiServerConnection = this;
    
    this.server.config.sourceManager.get(apiName, ['api'], function(err, source) {
        return apiServerConnection.sendResponse(http_status_codes['OK'], '', '', {
            success: 'true',
            data: source.data
        });
    }, false);
};

// function to send a response
APIServerConnection.prototype.sendResponse = function(status, expires, lastModified, data, type) {
   
    this.response.statusCode = status;
    data = JSON.stringify(data);

    this.response.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.response.setHeader('Content-Encoding', 'utf8');
    this.response.setHeader('Content-Length', Buffer.byteLength(data, 'utf8'));
    this.response.end(data);
};

module.exports = APIServer;