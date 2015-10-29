"use strict";

var uuid = require('node-uuid')
  , Promise = require('bluebird')
  , Session = require('./Session');

/**
 * `express-session` compatible session that supports a header token in addition to cookie token.
 *
 * Example usage in config file:
 *
 * ```js
 * features: [
 *   ...
 *   {
 *     feature: 'token-session'
 *     config: {
 *       storeClass: RedisSessionStore,
 *       storeOptions : {
 *         ttlSeconds : 60 * 60 * 24,
 *         host: 'localhost',
 *         port: 6379
 *       }
 *     }
 *   },
 *   ...
 * ]
 * ```
 *
 * For each request creates a session object and stores it to `req.session`. The session
 * object is persisted between requests using an instance of `config.storeClass`. The
 * session is identified by `config.tokenHeader` request header or cookie.
 *
 * The session object is read from the session store in the beginning of each request
 * and saved as the last thing in the request's lifecycle.
 *
 * The `config.storeClass` must be a constructor of a subclass of `./SessionStore`.
 * `config.storeOptions` object will be passed to the `config.storeClass` constructor
 * as a parameter when the store is created.
 *
 * @param {object} app Express.js Application.
 * @param {{storeClass: function, storeOptions: object, tokenHeader:String=}} config
 */
module.exports = function(app, config) {
  var storeClass = config.storeClass
    , storeOptions = config.storeOptions
    , tokenHeader = config.tokenHeader || 'X-Auth-Token'
    , storeConnected = false
    , store = null
    , self = this;

  if (!storeClass) {
    throw new Error('token-session: config.storeClass not given');
  }

  store = new config.storeClass(storeOptions);

  if (!(store instanceof module.exports.SessionStore)) {
    throw new Error('token-session: config.storeClass must be a subclass of SessionStore');
  }

  store.on('connect', function() {
    storeConnected = true;
  });

  store.on('disconnect', function() {
    storeConnected = false;
  });

  store.connect();

  app.use(function(req, res, next) {
    if (req.session) { return next(); }
    getSession(req)
      .spread(function(token, sessionData) {
        req.sessionData = sessionData;
        req.sessionToken = token;
        req.session = new Session(sessionData);
        // Wrap request.end method with code that saves the session
        // to the session store when the request ends.
        wrapRequestEndMethod(req, res, token);
        next();
      })
      .catch(next);
  });

  /**
   * Creates a new session and sends it to `SessionStore`.
   *
   * @warning This should only be used for tests! Never call this in production code.
   * @deprecated
   *
   * @param {String} token
   * @param {Object} sessionData
   */
  app.putSession = function(token, sessionData) {
    return self.putSession(token, sessionData);
  };

  /**
   * This can be used to create a session manually.
   *
   * @warning Use this with caution!
   *
   * @param {String} token
   * @param {Object} sessionData
   * @returns {Promise}
   */
  this.putSession = function (token, sessionData) {
    return store.set(token, JSON.stringify(sessionData));
  };

  /**
   * This can be used to get a session.
   *
   * @warning Use this with caution!
   *
   * @param {String} token
   * @returns {Promise}
   */
  this.getSession = function (token) {
    return store.get(token).then(function (sessionData) {
      if (sessionData) {
        return JSON.parse(sessionData);
      } else {
        return null;
      }
    });
  };

  /**
   * @private
   * @returns {Promise}
   */
  function getSession(req) {
    var token = req.get(tokenHeader);
    if (!token && req.cookies) {
      token = req.cookies[tokenHeader];
    }
    if (!storeConnected) {
      console.warn('yessql:auth: not connected to session store (maybe you need to start redis?)');
    }
    if (!token || !storeConnected) {
      return createNewSession();
    } else {
      return fetchSessionFromStore(token);
    }
  }

  /**
   * @private
   * @returns {Promise}
   */
  function createNewSession() {
    var token = uuid.v4();
    var emptySessionData = new Session().toString();
    return Promise.resolve([token, emptySessionData]);
  }

  /**
   * @private
   * @returns {Promise}
   */
  function fetchSessionFromStore(token) {
    return store
      .get(token)
      .then(function(sessionData) {
        if (sessionData) {
          return [token, sessionData];
        } else {
          // No session found from the store.
          return createNewSession();
        }
      });
  }

  /**
   * @private
   */
  function wrapRequestEndMethod(req, res, token) {
    var originalEnd = res.end;

    res.end = function(data, endcoding) {
      if (!storeConnected) {
        return originalEnd.call(res, data, endcoding);
      }

      if (req.session) {
        var sessionData = req.session.toString();
        if (sessionData !== req.sessionData) {
          // Save only if session data has changed.
          store.set(token, sessionData).finally(function() {
            originalEnd.call(res, data, endcoding);
          });
        } else {
          originalEnd.call(res, data, endcoding);
        }
      } else {
        // Session destroyed, remove from store.
        store.del(token).finally(function() {
          originalEnd.call(res, data, endcoding);
        });
      }
    };
  }
};

module.exports.SessionStore = require('./SessionStore');
module.exports.RedisSessionStore = require('./RedisSessionStore');
module.exports.MemorySessionStore = require('./MemorySessionStore');
