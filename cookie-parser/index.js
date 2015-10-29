"use strict";

var cookieParser = require('cookie-parser');

/**
 * Feature that registers the express.js `cookie-parser` middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'cookie-parser'
 *     config: {
 *       // Config for express.js `cookie-parser` middleware.
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
 *    Config for express.js `cookie-parser` middleware.
 */
module.exports = function(app, config) {
  app.use(cookieParser(config));
};