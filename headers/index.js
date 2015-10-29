"use strict";

var _ = require('lodash');

/**
 * Registers an express.js middleware that adds headers to the response.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'headers',
 *     config: {
 *       'Content-Type': 'text/plain',
 *       'ETag': '12345'
 *     }
 *   },
 *   ...
 * ]
 * ```
 *
 * @param {object} app
 *    express.js Application instance.
 *
 * @param {object|function(Request):object} config
 *    Headers to add. Can be an http://expressjs.com/api#res.set object or function that takes a
 *    `Request` object as parameter and returns such object.
 */
module.exports = function(app, config) {
  app.use(function(req, res, next) {
    var headers = {};
    if (_.isFunction(config)) {
      headers = config(req);
    } else {
      headers = config;
    }
    res.set(headers);
    next();
  });
};
