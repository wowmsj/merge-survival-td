const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const target = process.env.TARGET || 'web';

// key.env（项目根目录，KEY=VALUE 逐行）；文件缺失或缺 key 时对应值为空字符串（游戏降级为纯游客模式）
// process.env 优先，方便 CI 注入
function loadKeyEnv() {
  const map = {};
  try {
    const fs = require('fs');
    const content = fs.readFileSync(path.resolve(__dirname, 'key.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1]) map[m[1]] = m[2];
    }
  } catch { /* key.env 不存在：全部按空处理 */ }
  return map;
}
const keyEnv = loadKeyEnv();

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
      __ASSET_VERSION__: JSON.stringify(Date.now().toString(36)),
      // 开发专用功能（夜战测试、2D/3D 切换等）：开发模式或 DEV_FEATURES=1 时开启；
      // itch 发布包（npm run build）关闭，自有服务器部署（deploy.sh 走 build:test）开启
      __DEV_FEATURES__: JSON.stringify(argv.mode !== 'production' || process.env.DEV_FEATURES === '1'),
      // Supabase（邮箱账号 + 云存档）：从 key.env 读取，process.env 优先；未配置时为空字符串，游戏自动降级为纯游客模式
      __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL ?? keyEnv.SUPABASE_URL ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY ?? keyEnv.SUPABASE_ANON_KEY ?? '')
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      inject: 'body'
    }),
    new CopyWebpackPlugin({
      patterns: [
        // generated/ 是 1024x1024 原图源目录，不进包；游戏用 resize-assets 生成的 images/
        // models/ 下只发布运行时 GLB 和清单：.blend 源文件、预览图、manifest、演示页不进包
        { from: 'assets', to: 'assets', noErrorOnMissing: true, globOptions: { ignore: [
          '**/generated/**', '**/backup_originals/**',
          '**/models/**/*.blend', '**/models/**/*-preview.png', '**/models/**/*-board.png',
          '**/models/**/*-alternate.png', '**/models/**/*-manifest.json', '**/models/**/voxel.html'
        ] } },
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
