const { merge } = require('webpack-merge');
const config = require('./webpack.common.js');


const prodTypeScriptConfig = merge(config.typeScriptConfig, {
    mode: 'production',
    devtool: 'source-map',
})


const prodSassConfig = merge(config.sassConfig, {
    mode: 'production',
    devtool: 'source-map',
})


module.exports = [
    prodTypeScriptConfig,
    prodSassConfig,
]

