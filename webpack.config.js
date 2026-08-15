const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const target = process.env.TARGET || 'web';

module.exports = (env, argv) => ({
  entry: './src/main.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@phaser': path.resolve(__dirname, 'src/phaser'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@platform': path.resolve(__dirname, 'src/platform')
    }
  },
  output: {
    filename: 'bundle.[contenthash:8].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },
  plugins: [
    // 每次构建注入版本号，BootScene 给素材 URL 加 ?v= 查询串，避免浏览器缓存旧图标
    new webpack.DefinePlugin({
      __ASSET_VERSION__: JSON.stringify(Date.now().toString(36))
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      inject: 'body'
    }),
    new CopyWebpackPlugin({
      patterns: [
        // generated/ 是 1024x1024 原图源目录，不进包；游戏用 resize-assets 生成的 images/
        { from: 'assets', to: 'assets', noErrorOnMissing: true, globOptions: { ignore: ['**/generated/**', '**/backup_originals/**'] } },
        { from: 'configs', to: 'configs', noErrorOnMissing: true }
      ]
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist')
    },
    compress: true,
    port: 8080,
    hot: true,
    open: true,
    allowedHosts: 'all'
  },
  performance: {
    hints: false
  },
  // 生产构建不出 source-map（10MB+，用户用不到）；dev server 保留方便调试
  devtool: argv.mode === 'production' ? false : 'source-map'
});
