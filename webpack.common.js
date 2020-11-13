const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const typeScriptConfig = {
  entry: {
    'index': [
      path.resolve(__dirname, 'homepage/static/src/ts/parallax/index.ts'),
      path.resolve(__dirname, 'homepage/static/src/ts/apps.ts'),
    ],
  },

  output: {
    path: path.resolve(__dirname, 'homepage/static/dist/js/'),
    filename: '[name].min.js'
  },

  plugins: [
    new CleanWebpackPlugin(),
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
    'base': [
      path.resolve(__dirname, 'homepage/static/src/css/fontawesome.scss'),
      path.resolve(__dirname, 'homepage/static/src/css/bulma.scss'),
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
