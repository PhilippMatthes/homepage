const path = require('path');

const typeScriptConfig = {
  mode: 'production',
  devtool: 'source-map',
  entry: {
    'index': [
      path.resolve(__dirname, 'homepage/static/src/ts/header.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/apps.ts'),
    ],
  },
  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/js/'),
    filename: '[name].min.js'
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


const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const sassConfig = {
  mode: 'production',
  devtool: 'source-map',

  entry: {
    'base': [
      path.resolve(__dirname, 'homepage/static/src/css/homepage.scss'),
      path.resolve(__dirname, 'homepage/static/src/css/navigation.scss'),
      path.resolve(__dirname, 'homepage/static/src/css/opensans.scss'),
    ],
    'index':
      path.resolve(__dirname, 'homepage/static/src/css/index.scss'),
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/css/'),
    filename: '[name].js'
  },

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


module.exports = [
  typeScriptConfig,
  sassConfig,
]
