"use strict";

var morgan = require('morgan');

/**
 * Feature that registers the express.js `morgan` middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'morgan'
 *     config: {
 *       // Config for express.js `morgan` middleware.
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
 *    Config for express.js `morgan` middleware.
 */
module.exports = function(app, config) {
  app.use(morgan(config));
};