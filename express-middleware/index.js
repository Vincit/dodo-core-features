"use strict";
var _ = require('lodash');

/**
 * Feature that registers an express.js middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'express-middleware',
 *     config: {
 *       loader: function () { return require('body-parser').json; }, // function or string
 *       middlewareConfig: {
 *         // Config for e.g. `body-parser` middleware.
 *       }
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
 *    Config for express.js middleware loader.
 */
module.exports = function(app, config) {
  var middleware = _.isFunction(config.loader) ? config.loader() : require(config.loader);
  app.use(middleware(config.middlewareConfig));
};
