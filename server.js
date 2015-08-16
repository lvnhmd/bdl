/*jslint node: true */
'use strict';
new require('./cas/')(
    require('./config'), [
        require('./sources/selfridges')
    ]
);
