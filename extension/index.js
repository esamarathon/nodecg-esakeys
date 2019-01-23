'use strict';

var nodecgAPIContext = require('./utils/nodecg-api-context');
module.exports = function(nodecg) {
	// Store a reference to this NodeCG API context in a place where other libs can easily access it.
	// This must be done before any other files are `require`d.
	nodecgAPIContext.set(nodecg);
	var emergencyMode = nodecg.Replicant('emergencyMode', {defaultValue: false, persistent: false});
	
	const obs = nodecg.extensions['nodecg-obs-util'];
	const xkeys = require('./utils/xkeys');
	const emergency = require('./emergency');
	const captures = require('./captures');
	const cameras = require('./cameras');
}