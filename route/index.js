"use strict";

var _ = require('lodash')
  , path = require('path')
  , color = require('cli-color')
  , express = require('express')
  , multiRequire = require('dodo/lib/utils/multi-require')
  , Router = require('./router/Router');

/**
 * Registers all routes declared in modules found in `config.routePaths`.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'route'
 *     config: {
 *       routePaths: [
 *         __dirname + '/../routes/*'
 *       ],
 *       defaultAuthHandler: function (req, transaction) {
 *         return req.user.checkSomething();
 *       }
 *     }
 *   },
 *   ...
 * ]
 * ```
 *
 * Paths that match the path patterns in `config.routePaths` are scanned for modules that export
 * a function. The function is called with a `Router` object (router/Router.js) as the first argument
 * and the application instance as the second. The function can use the `Router` to register handlers
 * for paths.
 *
 * The modules can optionally export a `rootPath` property. If `rootPath` is given all routes in that
 * module will be relative to that path.
 *
 * For example you have a following file in one of the `config.routePaths`:
 *
 * ```js
 * module.exports = function (router, app) {
 *   router.get('/awesome').handler(function (req, res) {
 *     res.text('awesome');
 *   });
 * };
 * module.exports.rootPath = '/api/v1';
 * ```
 *
 * Now your server will answer 'awesome' to a GET request to path /api/v1/awesome.
 *
 * @see Router#get for more examples on how to define routes.
 *
 * @param {object} app
 *    express.js Application instance.
 *
 * @param {Object} config
 *
 * @param {Array.<String>} config.routePaths
 *    `routePaths` is an array of path patterns from which the router files are searched
 *    The patterns can be anything supported by node-glob.
 *
 * @param {function(req, transaction)} config.defaultAuthHandler
 *    If given, all routes that don't declare their own authentication are authenticated
 *    using this function. The function should return true (or a promise that is resolved
 *    to true) to allow access and false otherwise. If the defaultAuthHandler is given,
 *    a route can still be made public by calling the `.public()` method of the `Route`.
 *
 * @param {Number} config.unauthenticatedStatusCode
 *    If given, respond with this status code when there is no user associated with the
 *    request, and the route requires authentication. If missing, the default is 401.
 */
module.exports = function (app, config) {
  var routeModules
    , routers = {}
    , testing = app.config.profile === 'testing';

  routeModules = _.reduce(config.routePaths, function (allModules, routePath) {
    var modules = multiRequire(routePath).filterModule(function (module) {
      return _.isFunction(module) ||  _.isFunction(module.default);
    }).require();
    return allModules.concat(modules);
  }, []);

  _.forEach(routeModules, function (module) {
    var rootPath = module.module.rootPath || '/'
      , expressRouter
      , router = routers[rootPath];

    if (!router) {
      expressRouter = express.Router();
      router = new Router(expressRouter, config.defaultAuthHandler, config.unauthenticatedStatusCode);

      if (!testing) {
        router = addLoggingToRouter(router, rootPath);
      }

      app.use(rootPath, expressRouter);
      routers[rootPath] = router;
    }
  });

  // Call the router functions only after all the features have been initialized and the
  // application is otherwise ready.
  app.on('appReady', function () {
    _.forEach(routeModules, function (module) {
      var routeModule = _.isFunction(module.module) ? module.module : module.module.default;
      var rootPath = routeModule.rootPath || '/';

      if (!testing) {
        logRegisteringRoutes(path.join(rootPath, module.fileName + module.fileExt));
      }

      routeModule(routers[rootPath], app);
    });
  });
};

module.exports.Router = Router;

/**
 * @private
 */
function addLoggingToRouter(router, rootPath) {
  _.forEach(['get', 'put', 'post', 'delete', 'patch'], function (verb) {
    var origMethod = router[verb];
    // Add logging to the route method.
    router[verb] = function () {
      var requestPath = path.join(rootPath, arguments[0]);
      logRegisteringRoute(verb, requestPath);
      return origMethod.apply(this, arguments);
    };
  });

  return router;
}

/**
 * @private
 */
function logRegisteringRoutes(path) {
  console.log(color.white('registering routes from ') + color.cyan(path));
}

/**
 * @private
 */
function logRegisteringRoute(verb, path) {
  console.log(' '
    , color.white('registering route')
    , color.magenta((verb.toUpperCase() + '   ').substring(0, 6))
    , color.cyan(path));
}
