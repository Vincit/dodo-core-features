"use strict";

var Route = require('./Route');

/**
 * Wrapper for express.Router that makes handlers aware of promises.
 *
 * @see Router#get for examples.
 * @constructor
 * @param {express.Router} expressRouter
 * @param {function} defaultAuthHandler
 * @param {Object} apiVersioningConfig
 */
function Router(expressRouter, defaultAuthHandler, unauthenticatedStatusCode, apiVersioningConfig) {
  /**
   * @type {express.Router}
   */
  this.expressRouter = expressRouter;
  /**
   * @type {function(req):boolean}
   */
  this.defaultAuthHandler = defaultAuthHandler || null;
  /**
   * @type {Number}
   */
  this.unauthenticatedStatusCode = unauthenticatedStatusCode || 401;
  /**
   * @type {Object}
   */
  this.apiVersioningConfig = apiVersioningConfig
}

/**
 * Creates a GET request handler that plays nice with promises.
 *
 * This method works like the `get` method of express, but adds the possibility to return
 * a response from the handler either as an object or a promise. No need to explicitly call
 * `res.send`, `res.json` etc.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .handler(function (req) {
 *     return req.models.SomeSqlModel.findById(req.params.id); // req.models from dodo-objection plugin
 *   });
 * ```
 *
 * The return value doesn't have to be a Promise or Thenable. Anything can be returned
 * from the handler.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .handler(function (req) {
 *     return {plain: 'old json'};
 *   });
 * ```
 *
 * We can even call the `res.send`, `res.json`, `res.end` etc. methods.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .handler(function (req, res) {
 *     res.send('just text');
 *   });
 * ```
 *
 * Add `.auth` method call to check if a user is logged in. If no user is logged in a
 * 401 error is sent. This can be overridden with the unauthenticatedStatusCode option.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .auth()
 *   .handler(function (req) {
 *     // We never get here if no user is logged in.
 *     return {plain: 'old json'};
 *   });
 * ```
 *
 * The `auth` method can also take a function as a parameter. The function should return
 * true/false or a Promise that evaluates to true or false. If false is returned a 403
 * response is sent.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .auth(function (req) {
 *     // Authenticate admins. We could also return a promise from here.
 *     return req.user.role === req.models.User.Role.Admin;
 *   })
 *   .handler(function (req, res, next) {
 *     // This is only executed if the `auth` function returned true.
 *   });
 * ```
 *
 * The `auth` and `handler` share a request specific context.
 *
 * ```js
 * router
 *   .get('/some/path/:id')
 *   .auth(function (req) {
 *     this.foo = 'bar';
 *     return true;
 *   })
 *   .handler(function (req, res, next) {
 *     console.log(this.foo); // --> 'bar'
 *     return this;
 *   });
 * ```
 *
 * @param {String} path
 * @returns {Route}
 */
Router.prototype.get = function (path) {
  return this._route(path, 'get');
};

/**
 * Creates a PUT request handler that plays nice with promises.
 *
 * @see Router#get For detailed documentation on how to use this method.
 * @param {String} path
 * @returns {Route}
 */
Router.prototype.put = function (path) {
  return this._route(path, 'put');
};

/**
 * Creates a PATCH request handler that plays nice with promises.
 *
 * @see Router#get For detailed documentation on how to use this method.
 * @param {String} path
 * @returns {Route}
 */
Router.prototype.patch = function (path) {
  return this._route(path, 'patch');
};

/**
 * Creates a POST request handler that plays nice with promises.
 *
 * @see Router#get For detailed documentation on how to use this method.
 * @param {String} path
 * @returns {Route}
 */
Router.prototype.post = function (path) {
  return this._route(path, 'post');
};

/**
 * Creates a DELETE request handler that plays nice with promises.
 *
 * @see Router#get For detailed documentation on how to use this method.
 * @param {String} path
 * @returns {Route}
 */
Router.prototype.delete = function (path) {
  return this._route(path, 'delete');
};

/**
 * @private
 */
Router.prototype._route = function (path, method) {
  return new Route({
    path: path,
    method: method,
    expressRouter: this.expressRouter,
    defaultAuthHandler: this.defaultAuthHandler,
    unauthenticatedStatusCode: this.unauthenticatedStatusCode,
    apiVersioningConfig: this.apiVersioningConfig
  });
};

module.exports = Router;
