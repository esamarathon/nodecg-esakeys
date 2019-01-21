'use strict';

var nodecg = require('./nodecg-api-context').get();

// Set up xKeys.
const XKeys = require('xkeys');
var myXKeysPanel;
try {myXKeysPanel = new XKeys();} catch(err) {nodecg.log.warn(err);}
if (!myXKeysPanel) return;

// Turn off all lights.
myXKeysPanel.setAllBacklights(false, false);
myXKeysPanel.setAllBacklights(false, true);

// Set intensity to full.
myXKeysPanel.setBacklightIntensity(255);

// Set flashing frequency.
myXKeysPanel.setFrequency(50);

// Error catching.
myXKeysPanel.on('error', err => {
	nodecg.log.warn('X-keys error: ', err);
});

// Help function for dev.
myXKeysPanel.on('downKey', keyIndex => {
	//console.log(keyIndex);
});

module.exports = myXKeysPanel;