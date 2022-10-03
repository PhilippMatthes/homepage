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
      path.resolve(__dirname, 'homepage/static/src/ts/index/apps/macbook.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/index/apps/peerbridge.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/index/ml/threedify.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/index/cloud/terminal.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/index/fullstack/fullstack.ts'),
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
      path.resolve(__dirname, 'homepage/static/src/css/vendor/termynal.scss'),
    ],
    'base': [
      path.resolve(__dirname, 'homepage/static/src/css/base/homepage.scss'),
      path.resolve(__dirname, 'homepage/static/src/css/base/navigation.scss'),
    ],
    'index':
      path.resolve(__dirname, 'homepage/static/src/css/index/index.scss'),
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
