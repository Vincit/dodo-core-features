"use strict";

var compression = require('compression');

/**
 * Feature that registers the express.js `compression` middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'compression'
 *     config: {
 *       // Config for express.js `compression` middleware.
 *     }
 *   },
 *   ...
 * ]
 * ```
 *
 * @param {object} app
 *    express.js Application instance.
 *
 * @param {object} config
 *    Config for express.js `compression` middleware.
 */
module.exports = function(app, config) {
  app.use(compression(config));
};