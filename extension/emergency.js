var nodecg = require('./utils/nodecg-api-context').get();
const xkeys = require('./utils/xkeys');
const obs = nodecg.extensions['nodecg-obs-util'];
var emergencyMode = nodecg.Replicant('emergencyMode');

var emergencyDoubleCheck = false;
var emergencyTimeout;

// Listen to pressed keys.
xkeys.on('downKey', keyIndex => {
	// Disable everything if emergency mode is on.
	if (emergencyMode.value)
		return;

	// Keys are sent as strings.
	keyIndex = parseInt(keyIndex);

	// Emergency button.
	// Big key at the bottom left is both 7 and 15; only need to use one.
	// Emergency mode is currently permanant, maybe need a way to clear the setting?
	if (keyIndex === 7) {
		// We don't want the button to be active straight away, so it needs to be pressed twice.
		if (!emergencyDoubleCheck) {
			emergencyDoubleCheck = true;

			// Make the lights blink red.
			xkeys.setBacklight(7, true, true, true);
			xkeys.setBacklight(15, true, true, true);

			// Set timeout so we stop waiting after 10 seconds.
			emergencyTimeout = setTimeout(() => {
				emergencyDoubleCheck = false;
				xkeys.setBacklight(7, false, true);
				xkeys.setBacklight(15, false, true);
			}, 10000);
		}

		else {
			nodecg.log.warn('EMERGENCY MODE ACTIVATED, SWITCHING SCENE AND MUTING AUDIO!');
			emergencyMode.value = true;
			clearTimeout(emergencyTimeout);

			// Make the lights solid red.
			xkeys.setBacklight(7, true, true);
			xkeys.setBacklight(15, true, true);

			// Mute the audio source set in the config.
			var muteOptions = {source: nodecg.bundleConfig.emergencyMode.audioSource, mute: true};
			obs.send('SetMute', muteOptions).catch((err) => {
				nodecg.log.warn(`Cannot mute OBS source [${muteOptions.source}]: ${err.error}`);
			});
			// Switch to the scene set in the config.
			var sceneOptions = {'scene-name': nodecg.bundleConfig.emergencyMode.scene};
			obs.send('SetCurrentScene', sceneOptions).catch((err) => {
				nodecg.log.warn(`Cannot switch OBS scene [${sceneOptions['scene-name']}]: ${err.error}`);
			});
		}
	}
});