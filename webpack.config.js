const path = require('path');

module.exports = {
  mode: 'production',

  devtool: 'source-map',

  entry: {
    'index': [
      path.resolve(__dirname, 'homepage/static/src/ts/header.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/apps.ts'),
    ],
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/js'),
    filename: '[name].bundle.js'
  },

  resolve: {
    extensions: [
      '.ts',
      '.js'
    ],
  },

  module: {
    rules: [
      {
        test: /\.tsx?/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
};
