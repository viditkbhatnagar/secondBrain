const path = require('path');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env, paths }) => {
      // Only modify for production builds
      if (env === 'production') {
        // Remove ALL workbox plugins from CRA (both GenerateSW and InjectManifest)
        webpackConfig.plugins = webpackConfig.plugins.filter(
          (plugin) => {
            const name = plugin.constructor.name;
            return name !== 'GenerateSW' && name !== 'InjectManifest';
          }
        );

        // Add our custom InjectManifest plugin
        webpackConfig.plugins.push(
          new WorkboxWebpackPlugin.InjectManifest({
            swSrc: path.resolve(__dirname, 'src/sw-template.js'),
            swDest: 'service-worker.js',
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
            exclude: [
              /\.map$/,
              /asset-manifest\.json$/,
              /LICENSE/,
              /index\.html$/, // Never precache index.html - always fetch fresh
            ],
            dontCacheBustURLsMatching: /\.[0-9a-f]{8}\./,
          })
        );
      }

      return webpackConfig;
    },
  },
};
