"use strict"
new require('./cas/')(
    require('./config'), [
        require('./sources/selfridges')
    ]
);
