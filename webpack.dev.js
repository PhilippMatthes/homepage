const { merge } = require('webpack-merge');
const config = require('./webpack.common.js');


const devTypeScriptConfig = merge(config.typeScriptConfig, {
    mode: 'development',
    devtool: 'inline-source-map',
})


const devSassConfig = merge(config.sassConfig, {
    mode: 'development',
    devtool: 'inline-source-map',
})


module.exports = [
    devTypeScriptConfig,
    devSassConfig,
]

