module.exports = {
  preset: 'jest-expo',
  transform: {
    '^.+\\.geojson$': '<rootDir>/src/services/routing/geojson-transform.js',
  },
};
