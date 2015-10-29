"use strict";

var session = require('express-session');

/**
 * Feature that registers the express.js `express-session` middleware.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'express-session'
 *     config: {
 *       // Config for express.js `express-session` middleware.
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
 *    Config for express.js `express-session` middleware.
 */
module.exports = function(app, config) {
  app.use(session(config));
};

/**
 * These features must be initialized before this one.
 *
 * @type {Array.<String>}
 */
module.exports.dependencies = ['cookie-parser'];
module.exports.SessionMemoryStore = require('./SessionMemoryStore');