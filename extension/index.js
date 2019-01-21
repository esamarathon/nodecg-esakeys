module.exports = function(nodecg) {
	const obs = nodecg.extensions['nodecg-obs-util'];

	obs.on('ConnectionOpened', () => {
		nodecg.log.info('connection opened and ready to go')
	});
}