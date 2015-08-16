/*jslint node: true */
'use strict';
var Source = require('../cas/Source');

module.exports = [{
    pattern: 'selfridges',
    handler: function(name) {
        return new Source(name, {
            type: 'dynamic',
            path: 'www.selfridges.com/GB/en/cat/OnlineBrandDirectory',
            process: function() {
                return this.getResult();
            }
        });
    }
}];