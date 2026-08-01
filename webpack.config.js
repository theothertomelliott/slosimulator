const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: 'slosimulator', // The global name if loaded via a script tag
    libraryTarget: 'umd', // Ensures compatibility with CommonJS, AMD, and script tags
    globalObject: 'this', // Prevents errors in environments like Node or Web Workers
    clean: true,          // Cleans the dist folder before each build
  },
  mode: 'production',
};
