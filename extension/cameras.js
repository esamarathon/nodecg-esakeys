var nodecg = require('./utils/nodecg-api-context').get();
const xkeys = require('./utils/xkeys');
const obs = nodecg.extensions['nodecg-obs-util'];
var emergencyMode = nodecg.Replicant('emergencyMode');

const clone = require('clone');

// Stores data for what keys are selected and such.
var capture = -1; // 0 -> 1 (as of now).
var cam = {0: 0, 1: 1}; // Key: camera capture, Value: camera source

// Default cropping values.
var cropZero = {'top': 0, 'right': 0, 'bottom': 0, 'left': 0};

// Initial cropping values for all cameras.
var cropCache = {
	0: clone(cropZero),
	1: clone(cropZero)
}; 

var captureTimeout;

// Key between code value and scene name in OBS.
var cameraCaptureKey = {
	0: nodecg.bundleConfig.obsScenes.camera1,
	1: nodecg.bundleConfig.obsScenes.camera2,
};

// Key between code value and source name in OBS.
var cameraSourceKey = {
	0: nodecg.bundleConfig.obsSources.cam1,
	1: nodecg.bundleConfig.obsSources.cam2,
	2: nodecg.bundleConfig.obsSources.cam3
};

// Fired when the OBS WebSocket actually connects.
// We already check this in obs.js but we need to do more on connection here.
obs.on('ConnectionOpened', () => {
	// Runs a camera visibility check using the function below.
	// 1 loop for camera captures, 1 for camera sources
	for (var i = 0; i < 2; i++) {
		for (var j = 0; j < 3; j++) {
			checkCameraVisibility(i, j);
		}
	}
});

// A bit of a sloppy/lazy way to get current camera visibility on startup from OBS.
// Used by looping through all camera captures/camera sources and updating the value.
// If 2 camera sources are visible, this could mess things up.
function checkCameraVisibility(i, j) {
	obs.send('GetSceneItemProperties', {
		'scene-name': cameraCaptureKey[i],
		'item': cameraSourceKey[j]
	}, (err, data) => {
		if (!err) {
			if (data.visible)
				cam[i] = j;
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

	// All 2 of the "Camera Capture" selection keys.
	if (keyIndex === 64 || keyIndex === 65) {
		var oldCapture = capture;
		capture = keyIndex-64;
		xkeys.setBacklight(keyIndex, true, true); // New key, On, Red
		
		// If an old capture was active but it's different from this one, turn the old key off.
		if (oldCapture >= 0 && oldCapture !== capture)
			xkeys.setBacklight(oldCapture+64, false, true); // Old key, Off, Red

		// If this capture is the same as the old one, turn it all off.
		else if (oldCapture === capture && oldCapture !== -1)
			turnOffCaptureSelection();
		
		// If the above options caused a capture to be active, blink the camera source keys.
		if (capture >= 0) {
			// If there was no old capture, starts blinking keys.
			if (oldCapture === -1) {
				// Starts blinking the relevant keys.
				blinkCameraSourceKeys(72+cam[capture]); // Ignore current camera capture.
			}

			// If not, turn off the previously selected camera source.
			else
				toggleCameraSourceKey(72+cam[oldCapture], false);

			// Set the current camera source value light to be constantly on.
			toggleCameraSourceKey(72+cam[capture], true);

			getCameraCropping(capture);
			setupCaptureTimeout();
		}
	}

	// If a capture is selected, we can use the keys to choose the current camera.
	if (capture >= 0 && (keyIndex === 72 || keyIndex === 73 || keyIndex === 74)) {
		var oldCam = cam[capture];
		cam[capture] = keyIndex-72;
		toggleCameraSourceKey(keyIndex, true);
		changeCameraSource();
		setupCaptureTimeout();
		
		// If there was an old camera source and it's not the same as the current one, make the old one blink.
		if (oldCam >= 0 && oldCam !== cam[capture])
			toggleCameraSourceKey(72+oldCam, false);
	}

	// Reset camera "cropping"/position back to the middle.
	if (capture >= 0 && keyIndex === 66) {
		xkeys.setBacklight(keyIndex, true, true);
		
		// Calculate the centre to the cropping.
		var fullCropH = (cropCache[capture].left+cropCache[capture].right)/2;
		var fullCropV = (cropCache[capture].top+cropCache[capture].bottom)/2;
		var cropValues = {'top': fullCropV, 'right': fullCropH, 'bottom': fullCropV, 'left': fullCropH};

		cropCache[capture] = clone(cropValues);
		applyCropping();
		setupCaptureTimeout();
	}
});

// Listen for keys to be lifted.
xkeys.on('upKey', keyIndex => {
	// Keys are sent as strings.
	keyIndex = parseInt(keyIndex);

	// Turns off "reset cropping" light if needed.
	if (capture >= 0 && keyIndex === 66)
		xkeys.setBacklight(keyIndex, false, true);
});

// Inside wheel, -1 left, 1 right, don't do anything on 0.
xkeys.on('jog', deltaPos => {
	// Will try to change cropping (if applicable).
	if (capture >= 0)
		changeCrop(deltaPos);
});

// Outside wheel, -7 > 0 > 7
var oldShuttlePos = 0;
var shuttleTimeout;
xkeys.on('shuttle', shuttlePos => {
	// Will try to change cropping (if applicable).
	// Cropping with this wheel is only done every 100ms using a timeout.
	if (capture >= 0) {
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
		// Top/bottom cropping.
		if (cropCache[capture].top > 0 || cropCache[capture].bottom > 0) {
			var croppingValues = calculateCrop(cropCache[capture].top, cropCache[capture].bottom, value);

			// Apply the cropping.
			cropCache[capture].top = croppingValues[0];
			cropCache[capture].bottom = croppingValues[1];
			applyCropping();
		}

		// Left/right cropping.
		if (cropCache[capture].left > 0 || cropCache[capture].right > 0) {
			var croppingValues = calculateCrop(cropCache[capture].left, cropCache[capture].right, value);

			// Apply the cropping.
			cropCache[capture].left = croppingValues[0];
			cropCache[capture].right = croppingValues[1];
			applyCropping();
		}
	}
}

// Calculator function for above.
function calculateCrop(aCurrent, bCurrent, value) {
	// Work out the cropping values.
	var aCrop = aCurrent + value;
	var bCrop = bCurrent - value;

	// Cap the cropping values if they went negative.
	if (aCrop < 0) {
		bCrop += aCrop;
		aCrop = 0;
	}
	else if (bCrop < 0) {
		aCrop += bCrop;
		bCrop = 0;
	}

	return [aCrop, bCrop];
}

// Toggles between blinking blue and red.
// on is true: blue -> red
// on is false: red -> blue
function toggleCameraSourceKey(key, on) {
	if (on) {
		xkeys.setBacklight(key, false, false); // Key, Off, Blue
		xkeys.setBacklight(key, true, true); // Key, On, Red
	}
	else {
		xkeys.setBacklight(key, false, true); // Key, Off, Red
		xkeys.setBacklight(key, true, false, true); // Key, On, Blue, Blinking
	}
}

// Turns on all the camera source key blue LEDs and makes them blink.
function blinkCameraSourceKeys(ignore) {
	for (var i = 72; i < 75; i++) {
		if (i === ignore) continue;
		xkeys.setBacklight(i, false, true); // Turn off Red
		xkeys.setBacklight(i, true, false, true); // Turn on Blue blinking
	}
}

// Turns off all the camera source key LEDs.
function turnOffCameraSourceKeys() {
	for (var i = 72; i < 75; i++) {
		xkeys.setBacklight(i, false, false); // Blue
		xkeys.setBacklight(i, false, true); // Red
	}
}

// This needs to be done every time a relevant button is pressed.
function setupCaptureTimeout() {
	// Clear (if needed) and (re)setup the timeout.
	clearTimeout(captureTimeout);
	captureTimeout = setTimeout(turnOffCaptureSelection, 30000); // 30 seconds
}

// Turns off the current capture selection.
function turnOffCaptureSelection() {
	xkeys.setBacklight(capture+64, false, true); // Capture key, Off, Red
	capture = -1;
	turnOffCameraSourceKeys();
	clearTimeout(captureTimeout);
}

// Used to get the camera cropping from OBS.
function getCameraCropping(i) {
	obs.send('GetSceneItemProperties', {
		'scene-name': nodecg.bundleConfig.obsScenes.gameLayout,
		'item': cameraCaptureKey[i]
	}, (err, data) => {
		if (!err)
			cropCache[i] = data.crop;
	});
}

// Used to change what camera source is visible on the current game capture.
// We have to loop through all the camera sources to be able to turn off the other ones.
function changeCameraSource() {
	for (var i = 0; i < 3; i++) {
		(function(i) {
			// Setup options for this camera source.
			var options = {
				'scene-name': cameraCaptureKey[capture],
				'item': cameraSourceKey[i],
				'visible': false
			};

			// If this camera source is the one we want visible, make it so.
			if (i === cam[capture])
				options.visible = true;

			// Send settings to OBS.
			obs.send('SetSceneItemProperties', options).catch((err) => {
				nodecg.log.warn(`Cannot change OBS source settings [${options['scene-name']}: ${options.item}]: ${err.error}`);
			});
		} (i));
	}
}

// Apply crop cache to currently selected camera.
function applyCropping() {
	// Setup options for this rack.
	var options = {
		'scene-name': nodecg.bundleConfig.obsScenes.gameLayout,
		'item': cameraCaptureKey[capture],
		'crop': cropCache[capture]
	};

	// Send settings to OBS.
	obs.send('SetSceneItemProperties', options).catch((err) => {
		nodecg.log.warn(`Cannot change OBS source settings [${options['scene-name']}: ${options.item}]: ${err.error}`);
	});
}