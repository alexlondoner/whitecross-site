const { onRequest } = require('firebase-functions/v2/https');

// Minimal HTTP function so the file is valid and deployable.
exports.health = onRequest((req, res) => {
	res.status(200).send('ok');
});
