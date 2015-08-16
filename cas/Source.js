/*jslint node: true */
'use strict';
var http = require('http');
var https = require('https');
// var fs = require('fs');
// var path = require('path');
var utils = require('./utils');

function Source(name, definition) {
    this.name = name;           // name of this source
    this.definition = definition; // definition of this source. This object is shared between instances; don't alter without cloning.
    this.config = null;         // global config.

    this.lastAccessed = 0;      // last time this source asked for (epoch ms)
    this.data = null;           // processed data of this source
    this.lastModified = 0;      // last time this source or its dependencies were modified (epoch ms)
    this.expires = 0;           // time this source expires (epoch ms)

    this.expiresSource = 'UNKONWN';
    this.activeExpiresSource = 'UNKNOWN';

    this.active = false;        // is currently getting this source
    this.depends = [];          // current dependency list for this refresh
    this.results = {};          // current results list for this refresh
    this.namedResults = {};
    this.isFetchingDepends = false;     // is currently fetching or getting dependencies
    this.callbacks = [];        // list of {startTime: epoch, cb: callback}s waiting on this source
    this.paths = [];            // all current paths leading to this source

    this.lastFetch = null;      // last time this source was fetched (epoch ms)

    this.fetchNextTimer = null; // timer handle used to schedule a refresh of this source
}

// configure this source
Source.prototype.init = function(config, callback) {
    callback = callback || function(){};

    // only run init once
    if(this.config) { return callback(); }
    this.config = config;

    // if this has a source type then include those details too
    if(this.definition.type) {
        var sourceType = config.sourceTypes[this.definition.type];
        if(!sourceType) {
            var err = new Error('No source type named '+this.definition.type+' found in the config');
            err.kind = 'definitions';
            err.source = this.name;
            throw err;
        }

        // set up definitions with source info
        for(var sourceItem in sourceType) {
            if(!this.definition[sourceItem]) {
                this.definition[sourceItem] = sourceType[sourceItem];
            }
        }

        if(!this.definition.uri) {
            this.definition.uri = (this.definition.basePath || '') + (this.definition.path || '');
        }

    }

    // set a default function if there isn't one specified in definition
    if(!this.definition.process) {
        var sources = this.definition.uri ? 1 : 0;
        if(this.definition.depends) {
            sources += Array.isArray(this.definition.depends) ?
                this.definition.depends.length :
                Object.keys(this.definition.depends).length;
        }
        if(sources > 1) {
            // if there are any dependencies then copy the source data
            this.definition.process = Source.copyFunction;
        } else {
            // otherwise just path through the data from the request
            this.definition.process = Source.passthroughFunction;
        }
    }

    // if this source can persist then try to load it
    if(this.definition.persist) {
        this.load(function(){
            callback();
        });
    } else {
        callback();
    }
};


// get the current data if still valid or go and update from the source
Source.prototype.get = function(paths, callback) {
    var startTime = Date.now();
    // add this name to new path loop
    for(var i=0; i<paths.length; i++) {
        this.paths.push(paths[i].concat([this.name]));
    }

    // set lastaccessed
    this.lastAccessed = Date.now();

    if(this.definition.returnStaleWhenExpired === true && this.data) {
        // if it has expired and we allow stale then send old data, but continue with fetch
        this.stale = true;

        callback.call(this, null, this);
    } else {
        // add callback to the queue
        this.callbacks.push({startTime: startTime, cb: callback});
    }

    // this source is already active then return and let the source get on with it
    if(this.active) {
        return;
    }

    // fire off get request if one is required for this source
    // var that = this;

    this.results = {};
    this.namedResults = {};

    this.processingTime = 0;

    // add local/remote fetch only if type is specified
    if(this.definition.type && this.definition.uri) {
        this.results[this.name] = {
            fired: false,
            complete: false,
            err: null,
            data: null,
            lastModified: null,
            expires: null,
            expiresSource: 'UNKNOWN'
        };
        this.namedResults.self = this.name;
    }

    // add dependencies from the source definition
    this.depends = [];
    if(this.definition.depends) {
        this.appendDepend(this.definition.depends);
    }

    // set this source to active after adding the depends so they don't autofire
    this.active = true;

    // timestamp the beginning of this fetch
    this.fetchStart = Date.now();

    // fire off depends
    for(var name in this.results) {
        this.fireDepend(name);
    }

    // check if we are already finished
    this.done();
};



// get data of result by nickname or path
Source.prototype.getResult = function(name, throwError) {
    console.log('Source.prototype.getResult begin'.verbose);
    var result = this.getResultRecord(name, throwError);
    if(!result) { return undefined; }
    if(throwError && result.err) {
        throw result.err;
    }
    console.log('Source.prototype.getResult end'.verbose);
    return result.data;
};

// get result by nickname or path
Source.prototype.getResultRecord = function(name, throwError) {
    if(!name) { name = 'self'; }
    name = name.toLowerCase();
    var originalName = name;
    var namedResult = this.namedResults[name];
    if(namedResult) {
        name = namedResult;
    }
    var result = this.results[name];
    if(throwError && !result) {
        throw new Error('Result not found: '+name +((name !== originalName) ? '('+originalName+')' : ''));
    }
    return result;
};


Source.prototype.isFetching = function(name){
    return this.isFetchingDepends;
};

// fire off a dependency
Source.prototype.fireDepend = function(name){
    var that = this;

    var result = this.results[name];

    // sanity
    if(!this.active || !result || result.fired){ return; }

    result.fired = true;
    this.isFetchingDepends = true;

    if(name === this.name) {
        // if this is a local fetch job then fetch
        result.fetchStartTimestamp = Date.now();
        this.fetch(function(err, data, lastModified){
            if(err) {
                err.kind = err.kind || 'fetch';
                err.source = err.source || that.name;
                result.err = err;
                console.error(err);
            } else {
                // if we got a last modified from the request then remember that for this source.
                if(lastModified) {
                    // this is for this fetch. this is used as the ifModifiedSince when fetching again
                    // this is the result passed to the process function
                    result.lastModified = lastModified;
                }
                // if the ttl is given in seconds then set the expire to be in that amount of time from now
                if(that.definition.ttl) {
                    result.expires = Date.now() + that.definition.ttl;
                    result.expiresSource = that.name+' TTL';
                }
                // if the expiry time is given as a time  of day then work out the next time that occurs
                else if(typeof that.definition.expireTime === 'string') {
                    var expireTimeOfDay = that.definition.expireTime.split(':');
                    var expires = new Date();
                    expires.setUTCHours(parseInt(expireTimeOfDay[0],10)||0);
                    expires.setUTCMinutes(parseInt(expireTimeOfDay[1],10)||0);
                    expires.setUTCSeconds(0);
                    expires.setUTCMilliseconds(0);
                    // if this expiry before now then add a day
                    if(+expires < Date.now()) {
                        expires.setUTCDate(expires.getUTCDate()+1);
                    }
                    result.expires = +expires;
                    result.expiresSource = that.name+' ExpireTime';
                }
                // if no ttl is given, give this source a max expiry of 1 day from now.
                else {
                    result.expires = Date.now() + '1d'.Milliseconds;
                    result.expiresSource = that.name+' Default';
                }

                // set this result to the new or old fetched data
                result.data = data;

                if(!result.data) {
                    err = new Error('No data available from fetch');
                    err.kind = 'fetch';
                    err.source = that.name;
                    result.err = err;
                    console.error(err);
                }
            }

            // mark this result as complete, even if an error happened
            result.complete = true;

            // see if we have finished all dependencies
            that.done();

        });
    } 
    
};

// fetch a local or remote file
Source.prototype.fetch = function(callback) {
    var that = this;

    if(!this.config) {
        var err = new Error('Tried to fetch a source before config!');
        err.kind = 'fetch';
        err.source = this.name;
        throw err;
    }

    if(!this.definition.uri) {
        var err = new Error('Tried to fetch a source with no uri');
        err.kind = 'fetch';
        err.source = this.name;
        throw err;
    }

    // make a shallow copy of the fetch definitions for this source
    var options = utils.objectCopy(this.definition);

    // set agent based on priority of paths
    var roots = {};
    for(var i = 0; i<this.paths.length; i++) {
        roots[this.paths[i][0]] = true;
    }
    var agentName = 'precache';
    if(roots['refresh']) { agentName = 'refresh'; }
    if(roots['api'] && this.callbacks.length) { agentName = 'api'; }

    options.timeout = 30000;
    options.httpTimeout = 30000;
    options.retries = 0;
    options.retryDelay = 500;
    options.source = this.name;

    // get or create agent
    var proto = options.uri.indexOf('https://') === 0 ? https : http;
    if(!proto.agents) { proto.agents = {}; }
    options.agent = proto.agents[agentName];
    if(!options.agent) {
        options.agent = proto.agents[agentName] = new proto.Agent();
        options.agent.maxSockets = 10;
        options.agent.maxFetches = 10;
    }

    // fetch this source with a timeout
    this.config.transportManager.fetch(options, callback);
};

Source.prototype.checkDepends = function() {
    if(!this.active) {
        return false;
    }

    // check all jobs have finished
    for(var name in this.results) {
        if(!this.results[name].complete) {
            return false;
        }
    }

    // mark this source as all dependencies fired
    this.isFetchingDepends = false;

    // work out errs and expires
    var lastModified = this.lastModified || 0;
    var expires = 0;
    var expiresSource = 'UNKNOWN';
    var err;
    for(var name in this.results) {
        // get latest last modified
        if(this.results[name].lastModified && this.results[name].lastModified > lastModified) {
            lastModified = this.results[name].lastModified;
        }
        // get soonest expiry
        if(this.results[name].expires && !this.results[name].err && (!expires || this.results[name].expires < expires)) {
            expires = this.results[name].expires;
            expiresSource = this.results[name].expiresSource;
        }
        if(this.results[name].err) {
            if(name === this.name || !this.definition.allowFailedDepends) {
                if(!err) {
                    err = this.results[name].err;
                } else if(!this.results[name].err.logged) {
                    console.warn('Additional dependency error for', this.name, ':', this.results[name].err);
                }
            } else if(!this.results[name].err.logged) {
                console.warn('Allowed dependency error for', this.name, ':', this.results[name].err);
            }
        }
    }

    // save these off so they can get used by done
    this.activeLastModified = lastModified;
    this.activeExpires = expires;
    this.activeExpiresSource = expiresSource;
    this.activeErr = err;

    return true;
};

// check if the current active fetch has completed
Source.prototype.done = function() {
    // check we are active before calling done
    if(!this.active) {
        return;
    }

    if(!this.checkDepends()) {
        return;
    }

    // check if we are already processing
    if(this.isProcessing) {
        return;
    }

    // process the data if there was no error from the dependancies
    if(!this.activeErr) {
        var json = {};
        var processingStart = Date.now();
        this.modifiedByProcess = false;
        this.isProcessing = true;
        try {
//          console.log('Processing',this.name);
            json = this.definition.process.call(this, this.results, this.name, this.activeExpires, this.activeLastModified);
        } catch(e) {
            this.activeErr = e;
            this.activeErr.kind = this.activeErr.kind || 'processing';
            this.activeErr.source = this.activeErr.source || this.name;
        }
        this.isProcessing = false;
        this.processingTime += (Date.now() - processingStart);

        // check if we have triggered off any more dependencies in the process function
        if(this.isFetchingDepends) {
            // this done function will get run again
            if(this.activeErr) {
                // report any error here as we are returning and not passing it to a callback
                console.error('Error but still fetching:',this.activeErr);
            }
            return;
        }

        if(!this.activeErr) {
            if(!this.activeExpires) {
                console.warn(this.name, 'Zero activeExpires');
            }
            // this.setExpires(this.activeExpires || Date.now()+5000, this.activeExpiresSource);

            // set the last modified
            if(this.activeLastModified) {
                this.lastModified = this.activeLastModified;
            }

            if(this.modifiedByProcess || this.definition.alwaysModified || !this.lastModified) {
                this.lastModified = Date.now();
            }

            if(this.definition.maxAge) {
                var minLastModified = Date.now() - this.definition.maxAge;
                if(minLastModified > this.lastModified) {
                    this.lastModified = minLastModified;
                }
            }

            this.data = json;

            // not stale anymore
            this.stale = false;

        }
    }

    // update fetched date
    this.lastFetch = Date.now();

    // save is persisted
    if(this.definition.persist && !this.activeErr) {
        this.save();
    }

    // if this source is allowed to fail then report the error and clear the error
    if(this.activeErr && (this.definition.succeedOnFail || (this.definition.returnStaleOnFail && this.data))) {
        this.stale = true;
        console.warn('Source',this.name,'continuing with error',this.activeErr);
        if(!this.data) { this.data = this.definition.succeedOnFail === true ? { } : this.definition.succeedOnFail; }
        this.activeErr = null;
        this.setActiveExpires(Date.now()+'30s'.inMS, 'ErrorFailMinTTL');
    }

    this.processingTime = 0;

    // call callbacks waiting on this source
    while(this.callbacks.length) {
        var cb = this.callbacks.shift();
        
        try {
            cb.cb.call(this, this.activeErr, this);
            this.activeErr = null;
        } catch(e){
            e.kind = e.kind || 'callback';
            e.source = e.source || this.name;
            console.error(e);
        }
    }

    // report any error here if we are not passing it to a callback
    if(this.activeErr && !this.callbacks.length) {
        console.error(this.activeErr);
        this.activeErr = null;
    }

    // remove callback queue and results from memory
    this.results = {};
    this.namedResults = {};
    this.paths = [];
    this.active = false;
};

Source.Publish = function(func){
    func.publish = true;
    return func;
};

module.exports = Source;


