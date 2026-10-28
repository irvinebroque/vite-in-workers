const fs = require('./fs.cjs');
module.exports = fs.promises;
module.exports.constants = fs.constants;
