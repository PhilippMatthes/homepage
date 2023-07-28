const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CompressionPlugin = require("compression-webpack-plugin");


const typeScriptConfig = {
  entry: {
    'base': [
      path.resolve(__dirname, 'homepage/static/src/ts/base/hook.ts'),
    ],
    'index': [
      path.resolve(__dirname, 'homepage/static/src/ts/index/navigation.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/index/header/header.ts'),
    ],
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/js/'),
    filename: '[name].min.js'
  },

  plugins: [
    new CleanWebpackPlugin(),
    new CompressionPlugin(),
  ],

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


const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const sassConfig = {
  entry: {
    'vendor': [
      path.resolve(__dirname, 'homepage/static/src/css/vendor/fontawesome.scss'),
      path.resolve(__dirname, 'homepage/static/src/css/vendor/bulma.scss'),
    ],
    'homepage': [
      path.resolve(__dirname, 'homepage/static/src/css/homepage.scss'),
    ],
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/css/'),
    filename: '[name].js'
  },

  plugins: [
    new CleanWebpackPlugin(),
  ],

  module: {
    rules: [
      {
        test: /\.s[ac]ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              url: false,
              sourceMap: true,
            },
          },
          'sass-loader',
        ],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].min.css",
      chunkFilename: "[id].min.css",
    }),
  ],
};


module.exports = {
    typeScriptConfig: typeScriptConfig,
    sassConfig: sassConfig
};
