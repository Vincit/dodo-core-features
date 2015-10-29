"use strict";

var _ = require('lodash');

/**
 * Enables CORS.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'cors',
 *     config: {
 *       allowHeaders: ['X-Requested-With', 'X-Auth-Token', 'Content-Type', 'Range'],
 *       allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
 *       allowOrigins: [/localhost/, 'http://www.fake.lol'],
 *       exposeHeaders: ['Content-Range'],
 *       allowCredentials: true
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
 *
 * @param {Array.<String>} config.allowHeaders
 *    Array of allowed headers. Defaults to ['X-Requested-With', 'X-Auth-Token', 'Content-Type', 'Range'].
 *
 * @param {Array.<String>} config.allowMethods
 *    Array of allowed methods. Defaults to ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].
 *
 * @param {Array.<String|RegExp>} config.allowOrigins
 *    Array of origins or regular expressions to match against the request's origin. Special wildcard
 *    '*' allows all origins. Defaults to '*'.
 *
 * @param {Array.<String|RegExp>} config.exposeHeaders
 *    Array of headers that the client should be able to see. Defaults to ['Content-Range'].
 *
 * @param {Boolean} config.allowCredentials
 *    Value of 'Access-Control-Allow-Credentials' header.
 */
module.exports = function (app, config) {
  config = _.defaults(config || {}, {
    allowHeaders: ['X-Requested-With', 'X-Auth-Token', 'Content-Type', 'Range'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowOrigins: ['*'],
    exposeHeaders: ['Content-Range'],
    allowCredentials: true
  });

  app.use(function (req, res, next) {
    var origin = req.get('Origin');

    _.each(config.allowOrigins, function (allow) {
      if ((allow instanceof RegExp && allow.test(origin)) || allow === origin || allow === '*') {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Access-Control-Allow-Headers', config.allowHeaders.join(','));
        res.set('Access-Control-Allow-Methods', config.allowMethods.join(','));
        res.set('Access-Control-Allow-Credentials', config.allowCredentials.toString());
        res.set('Access-Control-Expose-Headers', config.exposeHeaders.join(','));
        return false;
      }
    });

    if ('OPTIONS' === req.method) {
      res.status(200).end();
    } else {
      next();
    }
  });
};
