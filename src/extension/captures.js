const clone = require('clone');
const nodecg = require('./utils/nodecg-api-context').get();
const xkeys = require('./utils/xkeys');
const obs = nodecg.extensions['esa-layouts'].obs;
const emergencyMode = nodecg.Replicant('emergencyMode');

if (!Object.entries(xkeys).length) return;

// Default cropping values.
const cropZero = {'top': 0, 'right': 0, 'bottom': 0, 'left': 0};

// Initial cropping values for all captures.
var cropCache = {
	0: clone(cropZero),
	1: clone(cropZero),
	2: clone(cropZero),
	3: clone(cropZero)
};

// Stores data for what keys are selected and such.
var capture = -1; // 0 -> 3 (as of now).
var cropSide = -1; //0 top, 1 right, 2 bottom, 3 left
const rack = {0: 0, 1: 1, 2: 2, 3: 3}; // Key: game capture, Value: rack

var captureTimeout;
var resetAllCroppingDoubleCheck = false;
var resetAllCroppingTimeout;

// Key between code value and scene name in OBS.
const gameCaptureKey = {
	0: nodecg.bundleConfig.obsVirtualScenes.capture1,
	1: nodecg.bundleConfig.obsVirtualScenes.capture2,
	2: nodecg.bundleConfig.obsVirtualScenes.capture3,
	3: nodecg.bundleConfig.obsVirtualScenes.capture4
};

// Key between code value and source name in OBS.
const rackKey = {
	0: nodecg.bundleConfig.obsSources.rack1,
	1: nodecg.bundleConfig.obsSources.rack2,
	2: nodecg.bundleConfig.obsSources.rack3,
	3: nodecg.bundleConfig.obsSources.rack4
};

nodecg.listenFor('turnOffCaptureSelection', turnOffCaptureSelection);

// Fired when the OBS WebSocket actually connects.
// We already check this in obs.js but we need to do more on connection here.
obs.on('ConnectionOpened', () => {
	// Gets current cropping settings on startup from the 4 "Game Capture" scenes.
	for (var i = 0; i < 4; i++) {
		checkCropping(i);
	}

	// Runs a rack visibility check using the function below.
	// 1 loop for game captures, 1 for racks
	for (var i = 0; i < 4; i++) {
		for (var j = 0; j < 4; j++) {
			checkRackVisibility(i, j);
		}
	}
});

// On startup gets the current cropping values from OBS.
// Only gets cropping from 1st rack; they should all be the same.
function checkCropping(i) {
	obs.send('GetSceneItemProperties', {
		'scene-name': gameCaptureKey[i],
		'item': rackKey[0]
	}, (err, data) => {
		if (!err)
			cropCache[i] = data.crop;
	});
}

// A bit of a sloppy/lazy way to get current rack visibility on startup from OBS.
// Used by looping through all game captures/racks and updating the value.
// If 2 racks are visible, this could mess things up.
function checkRackVisibility(i, j) {
	obs.send('GetSceneItemProperties', {
		'scene-name': gameCaptureKey[i],
		'item': rackKey[j]
	}, (err, data) => {
		if (!err) {
			if (data.visible)
				rack[i] = j;
		}
	});
}

// Listen to pressed keys.
xkeys.on('downKey', keyIndex => {
	// Disable everything if emergency mode is on.
	if (emergencyMode.value)
		return;
	
	// Keys are sent as strings.
	keyIndex = parseInt(keyIndex);

	// All 4 of the "Game Capture" selection keys.
	if (keyIndex === 60 || keyIndex === 61 || keyIndex === 62 || keyIndex === 63) {
		// Make sure the cameras can't be toggled at the same time.
		nodecg.sendMessage('turnOffCameraSelection');

		var oldCapture = capture;
		capture = keyIndex-60;
		xkeys.setBacklight(keyIndex, true, true); // New key, On, Red
		
		// If an old capture was active but it's different from this one, turn the old key off.
		if (oldCapture >= 0 && oldCapture !== capture)
			xkeys.setBacklight(oldCapture+60, false, true); // Old key, Off, Red

		// If this capture is the same as the old one, turn it all off.
		else if (oldCapture === capture && oldCapture !== -1) {
			turnOffCaptureSelection();
		}
		
		// If the above options caused a capture to be active, blink the rack/cropping keys.
		if (capture >= 0) {
			var oldCropSide = cropSide;
			cropSide = -1;

			// If there was no old capture, starts blinking keys.
			if (oldCapture === -1) {
				// Starts blinking the relevant keys.
				blinkRackKeys(68+rack[capture]); // Ignore current rack.
				blinkCroppingKeys();
			}

			// If not, turn off the previously selected rack/crop side.
			else {
				toggleRackOrCropKey(68+rack[oldCapture], false);
				if (oldCropSide !== -1) toggleRackOrCropKey(76+oldCropSide, false);
			}

			// Set the current rack value light to be constantly on.
			toggleRackOrCropKey(68+rack[capture], true);

			setupCaptureTimeout();
		}
	}

	// If a capture is selected, we can use the keys to choose the current rack.
	if (capture >= 0 && (keyIndex === 68 || keyIndex === 69 || keyIndex === 70 || keyIndex === 71)) {
		var oldRack = rack[capture];
		rack[capture] = keyIndex-68;
		toggleRackOrCropKey(keyIndex, true);
		changeRack();
		setupCaptureTimeout();
		
		// If there was an old rack and it's not the same as the current one, make the old one blink.
		if (oldRack >= 0 && oldRack !== rack[capture])
			toggleRackOrCropKey(68+oldRack, false);
	}

	// If a capture is selected, we can use the keys to choose the cropping side.
	if (capture >= 0 && (keyIndex === 76 || keyIndex === 77 || keyIndex === 78 || keyIndex === 79)) {
		var oldCropSide = cropSide;
		cropSide = keyIndex-76;
		toggleRackOrCropKey(keyIndex, true);
		setupCaptureTimeout();
		
		// If there was an old side and it's not the same as the current one, make the old one blink.
		if (oldCropSide >= 0 && oldCropSide !== cropSide)
			toggleRackOrCropKey(76+oldCropSide, false);

		// If the old side is the same as the current, make it blink.
		else if (oldCropSide === cropSide) {
			cropSide = -1;
			toggleRackOrCropKey(keyIndex, false);
		}
	}

	// Reset cropping on current capture.
	if (capture >= 0 && keyIndex === 75) {
		xkeys.setBacklight(keyIndex, true, true);
		cropCache[capture] = clone(cropZero);
		applyCropping(capture, cropCache[capture]);
		setupCaptureTimeout();
	}

	// Reset cropping on ALL captures. Does a "double check" thing so you need to press it twice.
	if (keyIndex === 67) {
		if (!resetAllCroppingDoubleCheck) {
			resetAllCroppingDoubleCheck = true;

			// Make the light blink red.
			xkeys.setBacklight(67, true, true, true);

			// Set timeout so we stop waiting after 10 seconds.
			resetAllCroppingTimeout = setTimeout(() => {
				resetAllCroppingDoubleCheck = false;
				xkeys.setBacklight(67, false, true);
			}, 10000);
		}

		else {
			clearTimeout(resetAllCroppingTimeout);
			resetAllCroppingDoubleCheck = false;

			// Turn off the light.
			xkeys.setBacklight(67, false, true);

			// Reset cropping on all captures.
			for (var i = 0; i < 4; i++) {
				cropCache[i] = clone(cropZero);
				applyCropping(i, cropCache[i]);
			}
		}
	}
});

// Listen for keys to be lifted.
xkeys.on('upKey', keyIndex => {
	// Keys are sent as strings.
	keyIndex = parseInt(keyIndex);

	// Turns off "reset cropping" light if needed.
	if (capture >= 0 && keyIndex === 75)
		xkeys.setBacklight(keyIndex, false, true);
});

// Inside wheel, -1 left, 1 right, don't do anything on 0.
xkeys.on('jog', deltaPos => {
	// Will try to change cropping (if applicable).
	if (cropSide >= 0)
		changeCrop(deltaPos);
});

// Outside wheel, -7 > 0 > 7
var oldShuttlePos = 0;
var shuttleTimeout;
xkeys.on('shuttle', shuttlePos => {
	// Will try to change cropping (if applicable).
	// Cropping with this wheel is only done every 100ms using a timeout.
	if (cropSide >= 0) {
		if (shuttlePos === 0)
			clearInterval(shuttleTimeout);
		else if (oldShuttlePos === 0 && shuttlePos !== 0)
			shuttleTimeout = setInterval(() => {changeCrop(oldShuttlePos)}, 100);
	}
	
	oldShuttlePos = shuttlePos;
});

// Used for changing the cropping from both wheels.
function changeCrop(value) {
	setupCaptureTimeout();

	if (value !== 0) {
		switch (cropSide) {
			case 0:
				cropCache[capture].top = calculateCrop(cropCache[capture].top, value);
				break;
			case 1:
				cropCache[capture].right = calculateCrop(cropCache[capture].right, value);
				break;
			case 2:
				cropCache[capture].bottom =  calculateCrop(cropCache[capture].bottom, value);
				break;
			case 3:
				cropCache[capture].left = calculateCrop(cropCache[capture].left, value);
				break;
		}

		applyCropping(capture, cropCache[capture]);
	}
}

// Calculator function for above.
function calculateCrop(side, pos) {
	var amount = side + pos;
	if (amount < 0) amount = 0;
	return amount;
}

// This needs to be done every time a relevant button is pressed.
function setupCaptureTimeout() {
	// Clear (if needed) and (re)setup the timeout.
	clearTimeout(captureTimeout);
	captureTimeout = setTimeout(turnOffCaptureSelection, 30000); // 30 seconds
}

// Turns off the current capture selection.
function turnOffCaptureSelection() {
	xkeys.setBacklight(capture+60, false, true); // Capture key, Off, Red
	capture = -1;
	cropSide = -1;
	turnOffRackKeys();
	turnOffCroppingKeys();
	clearTimeout(captureTimeout);
}

// Toggles between blinking blue and red.
// on is true: blue -> red
// on is false: red -> blue
function toggleRackOrCropKey(key, on) {
	if (on) {
		xkeys.setBacklight(key, false, false); // Key, Off, Blue
		xkeys.setBacklight(key, true, true); // Key, On, Red
	}
	else {
		xkeys.setBacklight(key, false, true); // Key, Off, Red
		xkeys.setBacklight(key, true, false, true); // Key, On, Blue, Blinking
	}
}

// Turns on all the cropping key blue LEDs and makes them blink.
function blinkCroppingKeys() {
	for (var i = 76; i < 80; i++) {
		xkeys.setBacklight(i, false, true); // Turn off Red
		xkeys.setBacklight(i, true, false, true); // Turn on Blue blinking
	}
}

// Turns off all the cropping key LEDs.
function turnOffCroppingKeys() {
	for (var i = 76; i < 80; i++) {
		xkeys.setBacklight(i, false, false); // Blue
		xkeys.setBacklight(i, false, true); // Red
	}
}

// Turns on all the rack key blue LEDs and makes them blink.
function blinkRackKeys(ignore) {
	for (var i = 68; i < 72; i++) {
		if (i === ignore) continue;
		xkeys.setBacklight(i, false, true); // Turn off Red
		xkeys.setBacklight(i, true, false, true); // Turn on Blue blinking
	}
}

// Turns off all the rack key LEDs.
function turnOffRackKeys() {
	for (var i = 68; i < 72; i++) {
		xkeys.setBacklight(i, false, false); // Blue
		xkeys.setBacklight(i, false, true); // Red
	}
}

// Applies cropping to all racks on the current game capture.
function applyCropping(cap, cropValues) {
	for (var i = 0; i < 4; i++) {
		(function(i) {
			// Setup options for this rack.
			var options = {
				'scene-name': gameCaptureKey[cap],
				'item': rackKey[i],
				'crop': cropValues
			};

			// Send settings to OBS.
			obs.send('SetSceneItemProperties', options).catch((err) => {
				nodecg.log.warn(`Cannot change OBS source settings [${options['scene-name']}: ${options.item}]: ${err.error}`);
			});
		} (i));
	}
}

// Used to change what rack is visible on the current game capture.
// We have to loop through all the racks to be able to turn off the other ones.
function changeRack() {
	for (var i = 0; i < 4; i++) {
		(function(i) {
			// Setup options for this rack.
			var options = {
				'scene-name': gameCaptureKey[capture],
				'item': rackKey[i],
				'visible': false
			};

			// If this rack is the one we want visible, make it so.
			if (i === rack[capture])
				options.visible = true;

			// Send settings to OBS.
			obs.send('SetSceneItemProperties', options).catch((err) => {
				nodecg.log.warn(`Cannot change OBS source settings [${options['scene-name']}: ${options.item}]: ${err.error}`);
			});
		} (i));
	}
}