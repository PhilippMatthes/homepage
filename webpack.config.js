const path = require('path');

const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  mode: 'production',

  devtool: 'source-map',

  entry: {
    'js/header.min.js':
      path.resolve(__dirname, 'homepage/static/src/ts/header.ts'),
    'js/apps.min.js':
      path.resolve(__dirname, 'homepage/static/src/ts/apps.ts'),
    'css/homepage.min.js':
      path.resolve(__dirname, 'homepage/static/src/css/homepage.js'),
    'css/index.min.js':
      path.resolve(__dirname, 'homepage/static/src/css/index.js'),
    'css/navigation.min.js':
      path.resolve(__dirname, 'homepage/static/src/css/navigation.js'),
    'css/opensans.min.js':
      path.resolve(__dirname, 'homepage/static/src/css/opensans.js'),
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/'),
    filename: '[name]'
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
      {
        test: /\.s[ac]ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              url: false,
            },
          },
          'sass-loader',
        ],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
      chunkFilename: "[id].css",
    }),
  ],
};
