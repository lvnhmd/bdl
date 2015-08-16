/*jslint node: true */
'use strict';
var http = require('http');
var https = require('https');
var url = require('url');
var utils = require('./utils');
var xray = require('x-ray')();

function TransportManager() {
    this.config = {};
}

TransportManager.prototype.init = function(c) {
    this.config = c;
};


// fetch a url and return a json structure
TransportManager.prototype.fetch = function(options, ocb) {
    // set up a callback timeout for this request
    var cb = callbackTimeout(function(err, json, lastModified) {
        ocb(err, json, lastModified);
    }, options.timeout);

    this.oneFetch(options, cb, 1);
};

TransportManager.prototype.oneFetch = function(options, cb, tries) {
    var that = this;

    var code = 0;

    var tidyError = function(err) {
        if (err) {
            err.kind = err.kind || 'upstream';
            err.url = options.uri;
            err.source = options.source;
            err.http = code || 0;
        }
        return err;
    };

    // retry the request after a delay on faliure
    var retry = function() {
        var delay = options.retryDelay || 250;
        delay = Math.ceil((delay * tries) + (Math.random() * delay));
        tries++;
        console.log('RETRY', 'Retrying fetch after ' + delay + 'ms, try ' + tries);
        setTimeout(function() {
            that.oneFetch(options, cb, tries);
        }, delay);
    };

    // function to decode the raw text to to json
    function processRaw(raw, type, lastModified, cb) {
        var json;
        try {
            switch (type.slice(0, 1)) {
                case 'x':
                    // json = xml2json.toJson(raw, { object: true, coerce: true, trim: true, sanitize: false, reversible: true });
                    break;
                case 'h':

                    xray(raw, 'li.shopBrandItem', [{
                            name: 'a',
                            url: 'a@href',
                        }])
                        (function(err, data) {
                            if (err) {
                                console.log('Error: ' + err);
                            } else {
                                // console.log(data);
                                json = data;
                            }
                        });

                    break;
                case 'j':
                    json = JSON.parse(raw);
                    break;
                default:
                    json = {
                        text: '' + raw
                    };
            }
        } catch (e) {
            return cb(tidyError(e));
        }

        cb(null, json, lastModified || 0);
    }

    // set up timings and reporting for this request
    // var startTime = Date.now();
    var socketTime = null;
    var responseTime = null;


    try {


        // else
        if (options.method === 'GET' || options.method === 'POST') {

            // set up http request
            var parsedUrl = url.parse(options.uri);
            // set up options that will be passed to the request
            var protocol = parsedUrl.protocol === 'https:' ? https : http;
            var parsedOptions = {
                method: options.method,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || undefined,
                path: parsedUrl.path,
                headers: options.headers ? utils.objectCopy(options.headers) : {},
                agent: options.agent || protocol.globalAgent
            };
            if (parsedUrl.port) {
                parsedOptions.port = parsedUrl.port;
            }


            if (this.config.proxy && parsedUrl.protocol !== 'https:') {
                parsedOptions.headers.Hostname = parsedOptions.hostname + (parsedOptions.port ? ':' + parsedOptions.port : '');
                parsedOptions.hostname = this.config.proxy.host;
                parsedOptions.port = this.config.proxy.port;
                parsedOptions.path = options.uri;
            }


            // get the remote file
            var r = protocol.request(parsedOptions, function(res) {
                responseTime = Date.now();

                // on http error try again
                if (res.statusCode >= 500 && tries < options.retries) {
                    console.warn('Fetch', res.statusCode, 'error on try', tries, 'for', options.uri);
                    res.socket.end();

                    // report(res.StatusCode);
                    return retry();
                }




                if (res.statusCode === 200) {
                    // extract last modified from headers as epochms
                    var lastModified;
                    if (res.headers['last-modified']) {
                        lastModified = +utils.toDate(res.headers['last-modified']);
                    }
                    if (!lastModified) {
                        lastModified = Date.now();
                    }
                    // eat the content
                    // if size is available then precreate the buffer
                    var size = +res.headers['content-length'] || 0;
                    var raw = new Buffer(size);
                    if (size) {
                        var pos = 0;
                        res.on('data', function(chunk) {
                            chunk.copy(raw, pos);
                            pos += chunk.length;
                        });
                    } else {
                        // otherwise just concat the packets
                        res.on('data', function(chunk) {
                            raw = Buffer.concat([raw, chunk]);
                        });
                    }
                }

                // proccess the content
                res.once('end', function() {

                    if (res.statusCode === 200) { // the statuscode should always be 200 here anyway

                        // default to returning the entire response as text
                        var type = 'text';
                        if (options.contentType) {
                            // if a content type was specified then always use that
                            type = options.contentType;
                        } else if (res.headers['content-type']) {
                            // otherwise guess the type from the content type header
                            if (res.headers['content-type'].match(/xml/i)) {
                                type = 'xml';
                            } else if (res.headers['content-type'].match(/json/i)) {
                                type = 'json';
                            } else if (res.headers['content-type'].match(/text\/html/i)) {
                                type = 'html';
                            }
                        }

                        // save this response to cache
                        // that.setCache(options.uri, lastModified, type, raw);

                        // add to fetch stats
                        // report(200);

                        return processRaw(raw, type, lastModified, cb);
                    }

                });
            });
            r.setTimeout(options.httpTimeout || 60000, function() {
                code = code || 504;
                console.warn('Fetch HTTP connect timeout for ', options.uri);
                r.abort();
            });

            var errorHandler = function(err) {
                // try {
                //   res.socket.end();
                // } catch(e) {}

                err.kind = err.kind || 'upstream';
                err.url = options.uri;
                err.source = options.source;
                err.http = code || 0;

                if (tries < options.retries) {
                    console.warn('Fetch socket error on try', tries, 'for', options.uri, ':', err);
                    // report();
                    return retry();
                }



                return cb(tidyError(err));
            };

            r.on('socket', function(socket) {
                // mark off socket timer
                socketTime = Date.now();
                socket.removeAllListeners('error');
                socket.on('error', errorHandler);
            });
            r.on('error', errorHandler);

            r.end();

            // }); // end checkCache
        } else {
            var err = new Error('Unknown transport method ' + options.method);
            err.kind = err.kind || 'definition';
            cb(tidyError(err));
        }

    } catch (e) {
        e.kind = e.kind || 'fetch';
        console.error('Error firing request', e);
        // report();
        return cb(tidyError(e));
    }
};

module.exports = TransportManager;