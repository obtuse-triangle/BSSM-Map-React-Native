/**
 * Custom Jest transformer for .geojson files.
 *
 * GeoJSON is valid JSON, so this transformer simply returns the file
 * content as a CommonJS module export.
 */
const fs = require('fs');

exports.process = function process(sourceText, sourcePath) {
  return { code: `module.exports = ${sourceText};` };
};

exports.getCacheKey = function getCacheKey() {
  return 'geojson-transform';
};
