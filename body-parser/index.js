"use strict";

var bodyParser = require('body-parser');

/**
 * Feature that registers the express.js `body-parser` middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'body-parser'
 *     config: {
 *       // Config for express.js `body-parser` middleware.
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
 *    Config for express.js `body-parser` middleware.
 */
module.exports = function(app, config) {
  app.use(bodyParser.json(config));
};