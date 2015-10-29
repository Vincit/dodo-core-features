"use strict";

var _ = require('lodash')
  , Store = require('express-session').Store
  , classUtils = require('yessql-core/class-utils');

/**
 * Just like express-session MemoryStore, but with TTL support (and this one doesn't leak memory)
 *
 * @param {{ttl:Number}=} opt
 *    ttl: Session time to live in milliseconds. After this time the session
 *    is removed from the store.
 *
 * @extends Store
 * @constructor
 */
function SessionMemoryStore(opt) {
  /** @type {{ttl:Number}} */
  this.opt = opt || {};
  /** @type {Object.<String, StoredSession>} */
  this.sessions = {};
}

classUtils.inherits(SessionMemoryStore, Store);

/**
 * Attempt to fetch session by the given `sid`.
 *
 * @param {String} sid
 * @param {Function} fn
 */
SessionMemoryStore.prototype.get = function(sid, fn){
  var self = this;
  process.nextTick(function() {
    var storedSession = self.sessions[sid];
    if (storedSession) {
      var session = storedSession.getSession();
      var expires = ('string' === typeof session.cookie.expires)
        ? new Date(session.cookie.expires)
        : session.cookie.expires;
      if (!expires || new Date() < expires) {
        fn(null, session);
      } else {
        self.destroy(sid, fn);
      }
    } else {
      fn();
    }
  });
};

/**
 * Commit the given `session` object associated with the given `sid`.
 *
 * @param {String} sid
 * @param {Object} session
 * @param {Function} fn
 */
SessionMemoryStore.prototype.set = function(sid, session, fn){
  var self = this;
  process.nextTick(function() {
    var storedSession = self.sessions[sid];
    if (storedSession) {
      storedSession.setSession(session);
    } else {
      storedSession = new StoredSession(sid, session, self);
      self.sessions[sid] = storedSession;
    }
    if (fn) { fn(); }
  });
};

/**
 * Destroy the session associated with the given `sid`.
 *
 * @param {String} sid
 * @param {Function} fn
 * @api public
 */
SessionMemoryStore.prototype.destroy = function(sid, fn){
  var self = this;
  process.nextTick(function() {
    self.destroySync(sid);
    if (fn) { fn(); }
  });
};

/**
 * Synchronously destroy the session associated with the given `sid`.
 *
 * @param {String} sid
 */
SessionMemoryStore.prototype.destroySync = function(sid) {
  var storedSession = this.sessions[sid];
  if (storedSession) {
    storedSession.destroy();
    delete this.sessions[sid];
  }
};

/**
 * Invoke the given callback `fn` with all active sessions.
 *
 * @param {Function} fn
 * @api public
 */
SessionMemoryStore.prototype.all = function(fn){
  var arr = []
    , keys = Object.keys(this.sessions);
  for (var i = 0, len = keys.length; i < len; ++i) {
    arr.push(this.sessions[keys[i]].getSession());
  }
  fn(null, arr);
};

/**
 * Clear all sessions.
 *
 * @param {Function} fn
 * @api public
 */
SessionMemoryStore.prototype.clear = function(fn){
  _.each(this.sessions, function(session) {
    session.destroy();
  });
  this.sessions = {};
  if (fn) { fn(); }
};

/**
 * Fetch number of sessions.
 *
 * @param {Function} fn
 * @api public
 */
SessionMemoryStore.prototype.length = function(fn){
  fn(null, Object.keys(this.sessions).length);
};

/**
 * @param {String} sid
 * @param {Object} session
 * @param {SessionMemoryStore} store
 * @constructor
 */
function StoredSession(sid, session, store) {
  this.sid = sid;
  this.session = '';
  /** @type {SessionMemoryStore} */
  this.store = store;
  this.ttlHandle = null;
  this.setSession(session);
}

/**
 * @param {Object} session
 */
StoredSession.prototype.setSession = function(session) {
  this.resetTTL();
  this.session = JSON.stringify(session);
};

/**
 * @returns {Object}
 */
StoredSession.prototype.getSession = function() {
  this.resetTTL();
  return JSON.parse(this.session);
};

/**
 * Restart time to live timer.
 */
StoredSession.prototype.resetTTL = function() {
  this.clearTTL();
  this.startTTL();
};

/**
 * Stop time to live timer.
 */
StoredSession.prototype.clearTTL = function() {
  if (this.ttlHandle) {
    clearTimeout(this.ttlHandle);
    this.ttlHandle = null;
  }
};

/**
 * Start time to live timer.
 */
StoredSession.prototype.startTTL = function() {
  if (this.store.opt.ttl) {
    // Instead of creating a closure, use the same function (suicide) for each
    // setTimeout to reduce the memory and cpu load.
    this.ttlHandle = setTimeout(suicide, this.store.opt.ttl, this.store, this.sid);
  }
};

/**
 * This must be called when a session is destroyed.
 */
StoredSession.prototype.destroy = function() {
  this.clearTTL();
};

function suicide(store, sid) {
  store.destroySync(sid);
}

module.exports = SessionMemoryStore;
