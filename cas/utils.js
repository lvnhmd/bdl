
'use strict';
var fs = require('fs');

// empty function
global.nop = function(){};

// recursive mkdir (like mkdir -p)
exports.rmkdir = function(dir, cb) {
	var mode = '0775';
	// try non-recursively creating the dir first
	fs.mkdir(dir, mode, function(err){
		if (!err || err.code === 'EEXIST'){
			return fs.chmod(dir, mode, cb);
		}
		// recurse through path creating each part
		var paths = dir.split('/').slice(1);
		var p = '';
		var r = function(err){
			if(!paths.length) { return cb(); }
			p = p+'/'+paths.shift();
			fs.mkdir(p, mode, function(err) {
				if(err && err.code === 'EEXIST') {
					fs.chmod(p, mode, r);
				} else {
					if(err) { return cb(err); }
					r(err);
				}
			});
		};
		r();
	});
};

// Wrapper for callbacks to apply a timeout
global.callbackTimeout = function(cb, timeout) {
	if(!cb){
		throw new Error('callbackTimeout requires a function');
	}
	if(!timeout) { timeout = 30000; }

	// only call callback once
	var called = false;

	// get stacktrace by throwing and catching an error
	var err;
	try{
		throw new Error("Callback "+cb.name+" timed out after "+timeout+"ms");
	}catch(e) {
		err = e;
		err.name = "CallbackTimeoutError";
	}

	// setup timeout error on timer
	var timeoutHandle = setTimeout(function(){
		timeoutHandle = null;
		if(!called) {
			called = true;
			cb(err);
		}
	}, timeout);

	// setup callback function to cancel thetimeout
	return function(e){
		clearTimeout(timeoutHandle);
		timeoutHandle = null;
		err = null;
		if(!called) {
			called = true;
			var args = Array.prototype.slice.call(arguments);
			cb.apply(this, args);
		} else if(e instanceof Error) {
			console.error('Error after callback timed out:',e);
		}
	};
};

var dateRegexp = {
	numeric: /^([0-9]{4})(([0-9]{2})([0-9]{2})?)?$/,
	json: /^\\?\/Date\(([0-9]+)([\+\-][0-9]+)?\)\\?\/$/,
	W3C: /^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})(\.[0-9]+)?(Z|([+\-])([0-9]{2}):([0-9]{2}))$/,
	time: /\b([0-9]{2}):([0-9]{2})(:([0-9]{2}))?( (AM|PM))?\b/,
	date: /\b([0-9]{2})\/([0-9]{2})\/([0-9]{4})\b/,
	isodate: /\b([0-9]{4})-([0-9]{2})-([0-9]{2})\b/
};

// turn numbers or strings into a date by matching common patterns
exports.toDate = function(v) {
	if(v instanceof Date) { return v; }

	if(typeof v === 'number') {
		return new Date(v);
	}

	if(typeof v !== 'string') {
		return null;
	}

	if(v === '') {
		return new Date(0);
	}

	if(v === 'now') {
		return new Date();
	}

	if(v === 'today') {
		return new Date(exports.today());
	}

	var m, mt;
	m = dateRegexp.numeric.exec(v);
	if(m){
		return new Date(Date.UTC(+m[1], +m[3] ? +m[3]-1 : 0, +m[4] || 0));
	}
	m = dateRegexp.W3C.exec(v);
	if(m){
		var offsetmins = m[9] ? (m[9]==='-'?-1:1) * ((60*m[10]) + m[11]) : 0;
		return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]-offsetmins, +m[6], +m[7] || 0));
	}
	m = dateRegexp.json.exec(v);
	if(m){
		return new Date(+(m[1]));
	}
	m = dateRegexp.date.exec(v);
	if(m){
		mt = dateRegexp.time.exec(v);
		return new Date(Date.UTC(+m[3], +m[2]-1, +m[1], mt?(+mt[1] + (mt[6]==='PM'?12:0)):0, mt?+mt[2]:0, mt?(+mt[4]||0):0));
	}
	m = dateRegexp.isodate.exec(v);
	if(m){
		mt = dateRegexp.time.exec(v);
		return new Date(Date.UTC(+m[1], +m[2]-1, +m[3], mt?(+mt[1] + (mt[6]==='PM'?12:0)):0, mt?+mt[2]:0, mt?(+mt[4]||0):0));
	}
	// fall back to letting the Date constructer handle the string
	return new Date(v);
};

// turn a number of ms into nice short text representing that duration
exports.millisecondsToTime = function(n) {
	n = +n || 0;
	if (n < 1300) {
		return n+'ms';
	}
	n = n / 1000; // seconds
	if(n < 3) {
		return (Math.round(n * 10) / 10)+'s';
	}
	if(n < 60) {
		return Math.round(n)+'s';
	}
	n = n / 60; // minutes
	if(n < 10) {
		return (Math.round(n * 10) / 10)+'m';
	}
	if(n < 60) {
		return Math.round(n)+'m';
	}
	n = n / 60; // hours
	if(n < 24) {
		return (Math.round(n * 10) / 10)+'h';
	}
	n = n / 24; // days
	if(n < 7) {
		return (Math.round(n * 10) / 10)+'d';
	}
	n = n / 7; // weeks
	return (Math.round(n * 10) / 10)+'w';
};

// add zero padding to a number/string based on length
var pad = exports.zeroPad = function(s,p){
	p=p||2;
	s=''+s;
	while(s.length<p){
		s='0'+s;
	}
	return s;
};

// Date to output YYYYMMDD
exports.dateToNumeric = function(d) {
	if(isNaN(d.getUTCFullYear())) { d = new Date(0); }
	return ''+
		pad(d.getUTCFullYear(),4) +
		pad(d.getUTCMonth()+1) +
		pad(d.getUTCDate());
};

// Date to output YYYY-MM-DD
exports.dateToText = function(d) {
	if(isNaN(d.getUTCFullYear())) { d = new Date(0); }
	return ''+
		pad(d.getUTCFullYear(),4) + '-' + 
		pad(d.getUTCMonth()+1) + '-' +
		pad(d.getUTCDate());
};

// Date to output as Android/iOS compatible W3C date
exports.dateToW3C = function(d){
	if(isNaN(d.getUTCFullYear())) { d = new Date(0); }
	return ''+
		pad(d.getUTCFullYear(),4) + '-' +
		pad(d.getUTCMonth()+1) + '-' +
		pad(d.getUTCDate()) + 'T' +
		pad(d.getUTCHours()) + ':' +
		pad(d.getUTCMinutes()) + ':' +
		pad(d.getUTCSeconds()) +'+00:00';
};

// add prototype to Date to add days to a date
exports.dateAddDays = function(d,days) {
	if(isNaN(d.getUTCFullYear())) { d = new Date(0); }
	d.setUTCDate(d.getUTCDate()+days);
	return d;
};

// add prototype to Date to subtract days from a date
exports.dateSubtractDays = function(d,days) {
	if(isNaN(d.getUTCFullYear())) { d = new Date(0); }
	d.setUTCDate(d.getUTCDate()-days);
	return d;
};

// check if date is UTC today
exports.dateIsToday = function(d) {
	d = +d || 0;
	return d >= exports.today() && d < exports.tomorrow();
};

// check if date is before current UTC day
exports.dateIsBeforeToday = function(d) {
	d = +d || 0;
	return d < exports.today();
};

// check if date is after current UTC day
exports.dateIsAfterToday = function(d) {
	d = +d || 0;
	return d >= exports.tomorrow();
};

// add prototype getter to convert string into seconds number
exports.stringToSeconds = function(str) {
	var s = 0;
	var re = /(-?[0-9]+)([wdhms]?)/g;
	var m;
	while( (m = re.exec(str)) ) {
		switch(m[2]){
			case 'w': s += parseInt(m[1],10) * 60 * 60 * 24 * 7; break;
			case 'd': s += parseInt(m[1],10) * 60 * 60 * 24; break;
			case 'h': s += parseInt(m[1],10) * 60 * 60; break;
			case 'm': s += parseInt(m[1],10) * 60; break;
			default: s += parseInt(m[1],10);
		}
	}
	return s;
};

// add prototype getter to convert string into milliseconds number
exports.stringToMilliseconds = function(str) {
	return exports.stringToSeconds(str) * 1000;
};

// add prototype to String to convert a sentence into capital case
exports.toCapitalCase = function(s) {
	s = ''+s;
	var words = s.split(' ');
	for(var i=0; i<words.length; i++) {
		words[i] = words[i].substr(0,1).toUpperCase()+words[i].substr(1).toLowerCase();
	}
	return words.join(' ');
};

// add prototype to String to convert a sentence into camel case
exports.toCamelCase = function(s) {
	s = ''+s;
	var words = s.split(/[ _-]/);
	for(var i=0; i<words.length; i++) {
		words[i] = i ?
			words[i].substr(0,1).toUpperCase()+words[i].substr(1).toLowerCase() :
			words[i].toLowerCase();
	}
	return words.join('');
};

exports.stringEndsWith = function(string,suffix) {
    return string.indexOf(suffix, string.length - suffix.length) !== -1;
};

//~'foo'.indexOf('oo') which returns a truthy value if the substring is found, and a falsy value (0) if it isn’t.
exports.stringContains = function(string,substring) {
    return ~string.indexOf(substring);
};

// add UTC today Date function to compliment Date.now() function
exports.today = function() {
	var d = new Date();
	d.setUTCHours(0);
	d.setUTCMinutes(0);
	d.setUTCSeconds(0);
	d.setUTCMilliseconds(0);
	return +d;
};

// add UTC tomorrow Date function to compliment Date.now() function
exports.tomorrow = function() {
	var d = new Date();
	d.setUTCDate(d.getUTCDate()+1);
	d.setUTCHours(0);
	d.setUTCMinutes(0);
	d.setUTCSeconds(0);
	d.setUTCMilliseconds(0);
	return +d;
};

// Add copy function to Object to copy items from one object to another
exports.objectCopy = function(object, keys, convert, dest, forcenull) {
	if(typeof convert !== 'boolean'){ dest = convert; }
	var result = dest || {};
	if(!keys) { keys = Object.keys(object); }
	for(var i=0; i<keys.length; i++) {
		var v = object ? object[ keys[i] ] : null;
		if(forcenull && v === undefined) { v = null; }
		if(convert && v !== null && v !== undefined) {
			var t = keys[i].substr(0,2);
			if(t === 'd_') {
				var d = exports.toDate(''+v);
				v = +d;
				if(v!==v){ v = null; }
				result[ 'c_'+keys[i].substr(2) ] = v ? exports.dateToW3C(d) : null;
			}
			else if(t === 'n_') { v = +v; if(v!==v){ v = null; } }
			else if(t === 'c_') { v = ''+v; }
			else if(t === 'b_') { v = !!v; }
		}
		result[ keys[i] ] = v;
	}
	return result;
};

// add function to Object to return an array of object values to compliment Object.keys()
exports.objectValues = function values(object) {
	var results = [];
	for (var property in object) {
		if(object.hasOwnProperty(property)) {
			results.push(object[property]);
		}
	}
	return results;
};

// Always return an array whatever the input. Usefull when xml has one or no elements when an array is expected
exports.arrayCast = function(array) {
	if(Array.isArray(array)) { return array; }
	if(array === undefined || array === null) { return []; }
	return [ array ];
};

// Aways return object for given variable. If array use the first element.
exports.objectCast = function(object) {
	if(Array.isArray(object)) { object = object[0]; }
	if(typeof object !== 'object' || object === undefined || object === null) { return {}; }
	return object;
};

// Always return string or null for given variable. allow a default other than null
exports.stringCast = function(str, def) {
	if(typeof str === 'string'){ return str; }
	if(typeof str === 'number'){ return ''+str; }
	return arguments.length > 1 ? def : null;
};

// always return number or null for given variable. allow a default other than null
exports.numberCast = function(num, def) {
	if(typeof num === 'string'){ num = +num; }
	if(typeof num === 'number' && num === num){ return num; }
	return arguments.length > 1 ? def : null;
};

// always return a boolean for given variable
exports.booleanCast = function(b) {
	if(typeof b === 'boolean') { return b; }
	if(!b) { return false; }
	if(typeof b === 'string' && b.match(/^(false|no|0)$/i)){ return false; }
	return true;
};

// add function to alter a given array to remove duplicates
exports.removeDuplicates = function(a) {
	for(var i=a.length-1; i>=0; i--){
		if(a.indexOf(a[i]) !== i) {
			a.splice(i,1);
		}
	}
	return a;
};

// add function to merge arrays without duplicates
// (this is 20 times faster than the one below but only works for unique strings / cast strings)
exports.arrayMerge = function() {
	var dest = [];
	var seen = {};
	var arrays = Array.prototype.slice.call(arguments);
	for(var a = 0; a < arrays.length; a++){
		var array = arrays[a];
		for(var i = 0; i < array.length; i++){
			var v = array[i];
			if(!seen[v]) {
				dest[dest.length] = v;
				seen[v] = true;
			}
		}
	}
	return dest;
};

// add function to merge arrays without duplicates
exports.arrayMergeReal = function() {
	var dest = [];
	var arrays = Array.prototype.slice.call(arguments);
	for(var a = 0; a < arrays.length; a++){
		var array = arrays[a];
		for(var i = 0; i < array.length; i++){
			var v = array[i];
			if(!~dest.indexOf(v)) {
				dest[dest.length] = v;
			}
		}
	}
	return dest;
};


// add function to Object to remove circular references and replace with text placeholder.
exports.removeCircular = function(o) {
	var c = [];
	function r(o) {
		if(o === null || typeof o !== 'object') {
			return o;
		}
		if(~c.indexOf(o)) { return '[circular]'; }
		c.push(o);
		var n = Array.isArray(o) ? [] : {};
		for(var i in o) { n[i] = r(o[i]); }
		return n;
	}
	return r(o);
};

exports.mergeArrays = function() {
	var arrays = [].slice.call(arguments);
	// trim arrays
	for(var i = arrays.length-1; i >=0; i--) {
		if(!Array.isArray(arrays[i]) || !arrays[i].length) {
			arrays.splice(i, 1);
		}
	}
	if(arrays.length === 1) { return arrays[0]; }
	if(arrays.length === 0) { return []; }
	var r = [];
	return r.concat.apply(r, arrays);
};

exports.hasAppliedToPrimatives = false;

exports.applyToPrimatives = function() {
	// only apply once
	if(exports.hasAppliedToPrimatives) { return false; }
	exports.hasAppliedToPrimatives = true;

	// add static functions to primitives

	Date.today = exports.today;
	Date.tomorrow = exports.tomorrow;
	Object.copy = exports.objectCopy;
	Object.values = exports.objectValues;
	Object.cast = exports.objectCast;
	Array.cast = exports.arrayCast;
	String.cast = exports.stringCast;
	Number.cast = exports.numberCast;
	Boolean.cast = exports.booleanCast;
	Array.removeDuplicates = exports.removeDuplicates;
	Array.merge = exports.arrayMerge;
	Object.removeCircular = exports.removeCircular;
	Array.removeCircular = exports.removeCircular;

	// add functions to primitive prototypes

	Date.prototype.toNumeric = function() { return exports.dateToNumeric(this); };
	Date.prototype.toW3C = function(){ return exports.dateToW3C(this); };
	Date.prototype.toText = function(){ return exports.dateToText(this); };
	Date.prototype.addDays = function(days) { return exports.dateAddDays(this, days); };
	Date.prototype.subtractDays = function(days) { return exports.dateSubtractDays(this, days); };
	Date.prototype.isToday = function() { return exports.dateIsToday(this); };
	Date.prototype.isBeforeToday = function() { return exports.dateIsBeforeToday(this); };
	Date.prototype.isAfterToday = function() { return exports.dateIsAfterToday(this); };

	Number.prototype.toTime = function(){ return exports.millisecondsToTime(+this); };
	Number.prototype.toDate = function(){ return exports.toDate(+this); };

	String.prototype.__defineGetter__('inSeconds', function() {
		return exports.stringToSeconds(''+this);
	});
	String.prototype.__defineGetter__('inMS', function() {
		return exports.stringToMilliseconds(''+this);
	});
	String.prototype.__defineGetter__('inMS', function() {
		return exports.stringToMilliseconds(''+this);
	});
	String.prototype.toDate = function(){ return exports.toDate(''+this); };
	String.prototype.toCapitalCase = function(){ return exports.toCapitalCase(this); };
	String.prototype.toCamelCase = function(){ return exports.toCamelCase(this); };
    String.prototype.endsWith = function(suffix) { return exports.stringEndsWith(this, suffix); };
    String.prototype.contains = function(substring) { return exports.stringContains(this, substring); };

	return true;
};


//Search a javascript object for a property with a specific value

exports.searchJsonObj = function searchObj(obj,paramValue) {
    for (var key in obj) {
        if (typeof obj[key] === 'object') {
            var foundObj = searchObj(obj[key],paramValue);
            if(foundObj) {
                return foundObj;
            }
        }
        if (obj[key] === paramValue) {
//            console.log('property=' + key + ' value=' + obj[key]);
            return obj;
        }
    }
};
