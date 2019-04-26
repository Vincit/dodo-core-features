"use strict";

var _ = require('lodash')
  , AccessError = require('dodo/errors').AccessError
  , NotFoundError = require('dodo/errors').NotFoundError
  , HTTPError = require('dodo/errors').HTTPError
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
   * @type {Object}
   */
  this.handlerFuncs = {};
  /**
   * @type {Object}
   */
  this.apiVersioningConfig = opt.apiVersioningConfig;
}

/**
 * Installs an express middleware to the route.
 *
 * @param {function(IncomingMessage, function)} middleware
 * @returns {Route}
 */
Route.prototype.middleware = function (middleware) {
  if (_.size(this.handlerFuncs) > 0) {
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
  if (_.size(this.handlerFuncs) > 0) {
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
 * @private
 * @param {function(IncomingMessage, ServerResponse, Next)} handler
 * @param {number} apiVersion
 * @param {boolean} isDefault
 * @returns {Route}
 */
Route.prototype.handler_ = function (handler, apiVersion, isDefault) {
  var self = this;

  if (self.isApiVersioningEnabled_() === false && !_.isNil(apiVersion)) {
    throw new Error('cant define versioned handler because api versioning is not enabled');
  }

  // Set the default handler is needed (if called without apiVersion, or with isDefault=true)
  if (_.isNil(apiVersion) || isDefault === true) {
    var existingHandler = self.handlerFuncs['default'];

    if (existingHandler) {
      throw new Error('default handler func can be set only once per Route instance');
    } else {
      self.handlerFuncs['default'] = handler;
    }
  }
  
  // Set the api version handler if needed (if apiVersion is defined)
  if (!_.isNil(apiVersion)) {
    self.validateApiVersion_(apiVersion);

    var existingHandler = self.handlerFuncs[apiVersion];

    if (existingHandler) {
      throw new Error('apiVersion handler already exists, can be set only once.');
    } else {
      self.handlerFuncs[apiVersion] = handler;
    }
  }

  this.execute_();
  return this;
};

/**
 * Installs a handler for the route.
 *
 * @see Router#get for examples.
 * @param {function(IncomingMessage, ServerResponse, Next)} handler
 * @param {number} [apiVersion]
 * @returns {Route}
 */
Route.prototype.handler = function (arg1, arg2) {
  var self = this;
  var numberOfArguments = arguments.length;
  if (numberOfArguments <= 0 || numberOfArguments > 2) {
    throw new Error('Wrong number of arguments passed to .handler()')
  }
  if (numberOfArguments == 1) {
    return self.handler_(arg1, undefined, false);
  } else {
    return self.handler_(arg2, arg1, false);
  }
};

/**
 * Installs a default handler for the route.
 *
 * @see Router#get for examples.
 * @param {function(IncomingMessage, ServerResponse, Next)} handler
 * @param {number} [apiVersion]
 * @returns {Route}
 */
Route.prototype.defaultHandler = function (arg1, arg2) {
  var self = this;
  var numberOfArguments = arguments.length;
  if (numberOfArguments <= 0 || numberOfArguments > 2) {
    throw new Error('Wrong number of arguments passed to .defaultHandler()')
  }
  if (numberOfArguments == 1) {
    return self.handler_(arg1, undefined, true);
  } else {
    return self.handler_(arg2, arg1, true);
  }
};

/**
 * Finds handler for specified api version (optional)
 * If apiVersion is not provided, returns the default handler
 * 
 * @private
 * @param {number} [apiVersion]
 * @returns {function (Request, Response, next)}
 */
Route.prototype.findHandler_ = function (apiVersion, fallbackToDefault, fallbackToPrevious) {
  var self = this;
  var handler;

  // If no api version is provided in request
  if (_.isNil(apiVersion)) {
    // Fallback to default handler, if configured
    if (fallbackToDefault) {
      handler = self.handlerFuncs['default'];
    }
  // Api version is provided
  } else {
    // Try to find handler for the api version
    var handler = self.handlerFuncs[apiVersion];

    // If handler is not found, and fallbackToPrevious config is true
    if (!handler && fallbackToPrevious) {
      // Find previous api version from handlerFuncs keys
      var previousApiVersion = _.chain(self.handlerFuncs)
        .omit('default') // Omit default handler
        .keys() // Get apiVersions
        .filter(function(key) { // We don't want to include newer api versions than initially requested
          return key <= apiVersion;
        })
        .max() // Get the previous existing api version from the subset
        .value();
      // Get the handler from handlerFuncs
      if (previousApiVersion !== undefined) {
        handler = self.handlerFuncs[previousApiVersion]; 
      }
      // If no previous apiVersion handler is found, fallback to default handler if configured
      if (handler === undefined && fallbackToDefault) {
        handler = self.handlerFuncs['default'];
      }
    // At last resort, fallback to default if configured
    } else if (!handler && fallbackToDefault) {
      handler = self.handlerFuncs['default'];
    }
  }
  return handler;
};

/**
 * Tries to find apiVersion from request. Validates it if needed.
 * 
 * @private
 * @param {Object} req
 * @returns {number}
 */
Route.prototype.findApiVersionFromRequest_ = function (req) {
  var self = this;
  var fallbackToDefault = _.get(self, 'apiVersioningConfig.fallbackToDefaultHandler', true);
  var apiVersion = self.apiVersioningConfig.findApiVersionHandler(req);

  // If apiVersion is not defined in request, and fallback is not allowed, thrown an Error.
  if (apiVersion === undefined && fallbackToDefault === false) {
    throw new NotFoundError('Api version must be defined');
  // If apiVersion is defined, validate it
  } else if (apiVersion !== undefined) {
    self.validateApiVersion_(apiVersion);
  } else {
    // Api version is not defined in request, but fallback to default handler is allowed. Pass.
  }

  return apiVersion;
};

/**
 * Validates provided api version against apiVersionConfig availableApiVersions array
 * 
 * @private
 * @param {Object} req
 */
Route.prototype.validateApiVersion_ = function (apiVersion) {
  var self = this;
  var availableApiVersions = _.get(self, 'apiVersioningConfig.availableApiVersions');
  if (availableApiVersions &&  !_.includes(availableApiVersions, apiVersion)) {
    throw new NotFoundError('specified apiVersion not available. Available api versions are: ' + availableApiVersions.join(', '));
  }
};

/**
 * Finds if api versioning is enabled
 * 
 * @private
 */
Route.prototype.isApiVersioningEnabled_ = function () {
  var self = this;
  return _.get(self, 'apiVersioningConfig.enabled') === true;
};

/**
 * @private
 */
Route.prototype.execute_ = function () {
  var self = this;

  var path = this.path;
  if (self.isApiVersioningEnabled_() && _.isFunction(self.apiVersioningConfig.generateRoutePathHandler)) {
    path = self.apiVersioningConfig.generateRoutePathHandler(path);
  }

  this.expressRouter[this.method](path, function (req, res, next) {
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
    var apiVersion = undefined;

    if (self.isApiVersioningEnabled_()) {
      // Try to find api version from request. This also validates it and may throw an error.
      apiVersion = self.findApiVersionFromRequest_(req);
    }
    var handler = self.findHandler_(
      apiVersion,
      _.get(self, 'apiVersioningConfig.fallbackToDefaultHandler', true),
      _.get(self, 'apiVersioningConfig.fallbackToPreviousApiVersion', true)
    );
    if (!handler) {
      throw new NotFoundError('Handler not found');
    }

    var result = handler.call(context, req, res, next);
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
