const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('mbtiles');
config.resolver.sourceExts.push('geojson');
config.transformer.babelTransformerPath = require.resolve('./metro-geojson-transformer.js');

module.exports = config;
