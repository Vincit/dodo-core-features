"use strict";

var _ = require('lodash')
  , AccessError = require('dodo/errors').AccessError
  , NotFoundError = require('dodo/errors').NotFoundError
  , Promise = require('bluebird')
  , log = require('dodo/logger').getLogger('dodo-core-features.router');

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
   * @type {function (Request, Response, next)}
   */
  this.handlerFunc = null;
}

/**
 * Installs an express middleware to the route.
 *
 * @param {function(IncomingMessage, function)} middleware
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
 * @param {function(IncomingMessage)=} authHandler
 * @returns {Route}
 */
Route.prototype.auth = function (authHandler) {
  if (this.handlerFunc) {
    throw new Error('You must call auth(func) before handler(func)');
  }

  if (authHandler) {
    this.authHandlers.push(authHandler);
  }

  return this;
};

/**
 * Makes the route public by removing all authentications (including the defaultAuth method).
 *
 * @returns {Route}
 */
Route.prototype.public = function () {
  this.authHandlers = [];
  this.defaultAuthHandler = null;
  this._public = true;
  return this;
};

/**
 * This handler sends response by itself and we shouldn't apply default response sending actions for this one.
 *
 * Handler must return promise, which doesn't resolve until res.send is called.
 *
 * @returns {Route}
 */
Route.prototype.customResponse = function () {
  this._omitResultHandlers = true;
  return this;
};

/**
 * Installs a handler for the route.
 *
 * @see Router#get for examples.
 * @param {function(IncomingMessage, ServerResponse, Next)} handler
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
    // return for testing purposes...
    return self.handlerMiddleware_(req, res, next);
  });
};

/**
 * @private
 */
Route.prototype.handlerMiddleware_ = function (req, res, next) {
  var self = this;
  var promise = Promise.resolve();

  promise = promise.then(function () {
    return self.handle_(req, res, next);
  }).then(res => {
    return res;
  });

  // return promise for testing purposes
  return promise.then(function (result) {
    if (result === NO_RESULT) {
      if (!res.headersSent) {
        throw new Error("When using .customResponse() handler, the promise returned must not resolve before the response has been sent. " +
          "Requested path: " + req.path);
      }
      return;
    }
    if (!_.isObject(result) && !_.isString(result)) {
      throw new NotFoundError();
    } else {
      sendResult(result, req, res);
    }
    if (!res.headersSent) {
      log.error(
        { reqPath: req.path },
        "For some reason sendResult didn't throw an error, but call to res.send didn't set the res.headersSent correctly either. " +
        "This seems to happen some times when connection is closed by client during some certain moment."
      );
      throw new Error(
        "Unexpected error, for some reason call to res.send didn't set the res.headersSent attribute. " +
        "Maybe connection was closed by request. Requested path: " + req.path
      );
    }
  }).catch(next);
};

/**
 * @private
 */
Route.prototype.handle_ = function (req, res, next) {
  var self = this;
  var context = {};
  var authHandlers = (this.authHandlers && this.authHandlers.slice()) || [];
  var promise = Promise.resolve();

  _.forEach(self.expressMiddleware, function (middleware) {
    promise = promise.then(function () {
      return executeMiddleware(req, res, middleware);
    });
  });

  if (!this._public) {
    if (this.defaultAuthHandler) {
      authHandlers.unshift(this.defaultAuthHandler);
    } else {
      throw new Error("No defaultAuthHandler set for non-public route. Requested path: " + req.path);
    }
  }

  _.forEach(authHandlers, function (authHandler) {
    promise = promise.then(function () {
      return authHandler.call(context, req);
    }).then(function (ret) {
      if (_.isBoolean(ret)) {
        if (!ret) {
          throw new AccessError();
        }
      } else if (ret instanceof Error) {
        throw ret;
      } else {
        throw new Error("Invalid return value from auth handler. Requested path: " + req.path);
      }
    });
  });

  return promise.then(function () {
    var result = self.handlerFunc.call(context, req, res, next);
    if (self._omitResultHandlers) {
      return Promise.resolve(result).then(function () {
        return NO_RESULT;
      });
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
  if (Buffer.isBuffer(result)) {
    res.send(result);
    log.trace('Buffer result was sent', res.headersSent);
  } else if (_.isObject(result)) {
    res.set('Content-Type', 'application/json');
    // Pretty print json in development and testing modes.
    if (req.app.config.profile === 'development' || req.app.config.profile === 'testing') {
      res.send(JSON.stringify(result, null, 2));
      log.trace('Pretty json result was sent', res.headersSent);
    } else {
      res.send(JSON.stringify(result));
      log.trace('Production json result was sent', res.headersSent);
    }
  } else {
    res.send(result);
    log.trace('Unmodified result was sent', res.headersSent);
  }
  log.trace('End of sendResult', res.headersSent);
}
