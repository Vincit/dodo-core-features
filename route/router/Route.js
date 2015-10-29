"use strict";

var _ = require('lodash')
  , HTTPError = require('nails/lib/errors/HTTPError')
  , AccessError = require('nails/lib/errors/AccessError')
  , Promise = require('bluebird')
  , NotFoundError = require('nails/lib/errors/NotFoundError');

// Token used to indicate that no result was returned from a handler.
var NO_RESULT = {};

/**
 * @constructor
 */
function Route(opt) {
  /**
   * @type {express.Router}
   */
  this.expressRouter = opt.expressRouter;
  /**
   * @type {String}
   */
  this.method = opt.method;
  /**
   * @type {String|RegExp}
   */
  this.path = opt.path;
  /**
   * @type {function(req, transaction):boolean}
   */
  this.defaultAuthHandler = opt.defaultAuthHandler;
  /**
   * @type {Number}
   */
  this.unauthenticatedStatusCode = opt.unauthenticatedStatusCode;
  /**
   * @type {Array.<function (Request, Response, Transaction)>}
   */
  this.authHandlers = [];
  /**
   * @type {Array.<function (Request, Response, function)>}
   */
  this.expressMiddleware = [];
  /**
   * @type {function (Request, Response, Transaction)}
   */
  this.handlerFunc = null;
}

/**
 * Installs an express middleware to the route.
 *
 * @param {function(IncomingMessage, Transaction, function)} middleware
 * @returns {Route}
 */
Route.prototype.middleware = function (middleware) {
  if (this.handlerFunc) {
    throw new Error('You must call middleware(func) before handler(func)');
  }

  this.expressMiddleware.push(middleware);
  return this;
};

/**
 * Installs an authentication handler for the route.
 *
 * @see Router#get for examples.
 * @param {function(IncomingMessage, Transaction)=} authHandler
 * @returns {Route}
 */
Route.prototype.auth = function (authHandler) {
  if (this.handlerFunc) {
    throw new Error('You must call auth(func) before handler(func)');
  }

  this.authHandlers.push(authHandler || _.constant(true));
  return this;
};

/**
 * Makes the route public by removed all authentication (including the defaultAuth method).
 *
 * @returns {Route}
 */
Route.prototype.public = function () {
  this.authHandlers = [];
  this.defaultAuthHandler = null;
  return this;
};

/**
 * Installs a handler for the route.
 *
 * @see Router#get for examples.
 * @param {function(IncomingMessage, ServerResponse, Transaction)} handler
 * @returns {Route}
 */
Route.prototype.handler = function (handler) {
  if (this.handlerFunc) {
    throw new Error('handler(func) can be called just once per Route instance');
  }

  this.handlerFunc = handler;
  this.execute_();
  return this;
};

/**
 * @private
 */
Route.prototype.execute_ = function () {
  var self = this;

  this.expressRouter[this.method](this.path, function (req, res, next) {
    self.handlerMiddleware_(req, res, next);
  });
};

/**
 * @private
 */
Route.prototype.handlerMiddleware_ = function (req, res, next) {
  var self = this;
  var promise = Promise.resolve();

  promise = promise.then(function () {
    return self.handle_(req, res, null);
  });

  promise.then(function (result) {
    if (result === NO_RESULT) {
      return;
    }
    if (!result && !_.isString(result)) {
      throw new NotFoundError();
    } else {
      sendResult(result, req, res);
    }
  }).catch(next);
};

/**
 * @private
 */
Route.prototype.handle_ = function (req, res, transaction) {
  var self = this;
  var context = {};
  var authHandlers = this.authHandlers;
  var promise = Promise.resolve();

  _.forEach(self.expressMiddleware, function (middleware) {
    promise = promise.then(function () {
      return executeMiddleware(req, res, middleware);
    });
  });

  if (_.isEmpty(authHandlers) && this.defaultAuthHandler) {
    authHandlers = [this.defaultAuthHandler];
  }

  // If authentication handlers have been registered, first check
  // that a user has logged in.
  if (!_.isEmpty(authHandlers) && !req.user) {
    throw new HTTPError(this.unauthenticatedStatusCode);
  }

  _.forEach(authHandlers, function (authHandler) {
    promise = promise.then(function () {
      return authHandler.call(context, req, transaction);
    }).then(function (ret) {
      if (!ret) {
        throw new AccessError();
      }
    });
  });

  return promise.then(function () {
    var result = self.handlerFunc.call(context, req, res, transaction);

    // If there is no return value (or the return value is undefined) assume that
    // the handler calls res.end(), res.send() or similar method explicitly.
    if (_.isUndefined(result)) {
      return NO_RESULT;
    } else {
      return result;
    }
  });
};

module.exports = Route;

/**
 * @private
 */
function executeMiddleware(req, res, middleware) {
  return new Promise(function (resolve, reject) {
    var next = function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };
    middleware(req, res, next);
  });
}

/**
 * @private
 */
function sendResult(result, req, res) {
  if (_.isObject(result)) {
    res.set('Content-Type', 'application/json');
    // Pretty print json in development and testing modes.
    if (req.app.config.profile === 'development' || req.app.config.profile === 'testing') {
      res.send(JSON.stringify(result, null, 2));
    } else {
      res.send(JSON.stringify(result));
    }
  } else {
    res.send(result);
  }
}
