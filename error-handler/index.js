"use strict";

var _ = require('lodash')
  , fs = require('fs')
  , path = require('path')
  , HTTPError = require('dodo/lib/errors/HTTPError');

/**
 * Registers an *Express* middleware that catches errors and creates error responses.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'error',
 *     config: {
 *       handlerPaths: [
 *         '../error-handlers/'
 *       ],
 *       handlers: [
 *         'http',
 *         'postgres'
 *       ]
 *     }
 *   },
 *   ...
 * ]
 * ```
 *
 * This feature catches errors thrown throughout the framework and responds to the request with
 * an appropriate error response. For example throwing a `new HTTPError(404)` from anywhere along
 * the request handling chain will cause it to be caught by this feature. This feature will send
 * a response to the request with the given 404 status code.
 *
 * All error handlers in `config.handlers` array are added to the error handling chain. An error
 * handler is a module that exports a function that takes an error object and returns an error response
 * object or *falsy* if the error could not be handled. If the error object has `statusCode` property
 * its value is set as the status code of the response. Error handlers are searched from the folders
 * listed in `config.handlerPaths`. The `./handlers` folder is implicitly added to the list.
 *
 * @param {object} app
 *    express.js Application instance.
 *
 * @param {{handlerPaths:Array.<String>, handlers:Array.<String>}} config
 *    `handlerPaths` is an array of paths from which the handlers are searched. `handlers` is a list
 *    of handler names.
 */
module.exports = function(app, config) {
  var errorHandlers = createHandlers(config);

  app.use(function(err, req, res, next) {
    if (!err) { return next(); }
    var errorResponse = null;

    // Find an ErrorHandler that can handle this error.
    for (var i = 0; i < errorHandlers.length; ++i) {
      var errResponse = errorHandlers[i](err);
      if (errResponse) {
        errorResponse = errResponse;
        break;
      }
    }

    if (!errorResponse) {
      // No handler found. Send generic 500.
      var debugging = req.app.config.profile !== 'production';
      errorResponse = new HTTPError(500, debugging ? err.stack : null).toJSON();
      console.error(err.stack);
    }

    res.status(errorResponse.statusCode || 500).json(errorResponse);
  });
};

/**
 * @private
 */
function createHandlers(config) {
  var handlerPaths = _.flattenDeep([__dirname + '/handlers', config.handlerPaths]);
  return _.map(config.handlers, function(handlerName) {
    var handler = null;
    for (var i = 0; i < handlerPaths.length; ++i) {
      var handlerPath = path.join(handlerPaths[i], handlerName);
      if (fs.existsSync(handlerPath) || fs.existsSync(handlerPath + '.js')) {
        handler = require(handlerPath);
        if (_.isFunction(handler)) {
          break;
        } else {
          handler = null;
        }
      }
    }
    if (!handler) {
      throw new Error('Invalid handler', handlerName);
    }
    return handler;
  });
}
