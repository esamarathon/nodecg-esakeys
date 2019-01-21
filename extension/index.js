'use strict';

var nodecgAPIContext = require('./utils/nodecg-api-context');
module.exports = function(nodecg) {
	// Store a reference to this NodeCG API context in a place where other libs can easily access it.
	// This must be done before any other files are `require`d.
	nodecgAPIContext.set(nodecg);
	
	const obs = nodecg.extensions['nodecg-obs-util'];
	const xkeys = require('./utils/xkeys');

	obs.on('ConnectionOpened', () => {
		nodecg.log.info('connection opened and ready to go')
	});
}