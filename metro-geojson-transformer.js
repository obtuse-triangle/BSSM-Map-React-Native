/**
 * Custom Metro babel transformer for .geojson files.
 *
 * GeoJSON is valid JSON, so this transformer converts .geojson files into
 * CommonJS modules by wrapping them in `module.exports = ...;`, then
 * delegates to the default Expo babel transformer for AST generation.
 *
 * Required by metro.config.js via `transformer.babelTransformerPath`.
 */
const { createRequire } = require('module');

// @expo/metro-config is a transitive dependency of expo and may not be
// hoisted to the top-level node_modules. Use createRequire anchored to
// the expo package (which is always resolvable) to reach it.
const expoRequire = createRequire(require.resolve('expo/metro-config'));
const expoBabelTransformer = expoRequire(
  '@expo/metro-config/build/babel-transformer'
);

module.exports = {
  transform({ filename, src, options, plugins }) {
    if (filename.endsWith('.geojson')) {
      return expoBabelTransformer.transform({
        filename: filename.replace(/\.geojson$/, '.js'),
        src: 'module.exports = ' + src + ';',
        options,
        plugins,
      });
    }
    return expoBabelTransformer.transform({ filename, src, options, plugins });
  },
};
