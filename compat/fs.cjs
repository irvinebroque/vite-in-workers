// Vite and Rolldown share this filesystem inside each fresh Worker.
const { fs } = require('memfs');

// Vite probes Node's native realpath API during initialization.
fs.realpathSync.native ??= fs.realpathSync;
fs.realpath.native ??= fs.realpath;

module.exports = fs;
