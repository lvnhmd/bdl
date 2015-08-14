var Source = require('../as/source');

module.exports = [{
    pattern: 'selfridges'
    handler: function(name, m) {
        return new Source(name, {
            type: 'dynamic',
            path: 'www.selfridges.com/GB/en/cat/OnlineBrandDirectory',
            // ttl: '5m'.inMS,
            process: function() {
                var json = [];
                console.log('retrieve selfridges source begin'.input);
                var feed = this.getResult();
                console.log(feed);
                // x('http://www.selfridges.com/en/OnlineBrandDirectory/?categoryId=548261&storeSelect=ONLINE&catalogId=16151&storeId=10052&langId=-1', 'li.shopBrandItem', [{
                //         name: 'a',
                //         url: 'a@href',
                //     }])
                //     .paginate('.next_page@href')
                //     .limit(3)
                //     .write('../persist/selfridges.json');
                console.log('retrieve selfridges source end'.input);
                return json;
            }
        });
    }
}]