"use strict";

var _ = require('lodash')
  , SessionStore = require('./SessionStore')
  , Promise = require('bluebird')
  , util = require('util')
  , redis = require('redis');

/**
 * `SessionStore` that saves the session to Redis.
 *
 * Examples:
 *
 * ```js
 * var store1 = new RedisSessionStore({
 *   host: '192.168.1.123',
 *   port: 8900,
 *   ttlSeconds: 24 * 60 * 60,
 *   password: 'password'
 * });
 *
 * var store2 = new RedisSessionStore({
 *   ttlSeconds: 24 * 60 * 60,
 *   url: 'redis://<user>:<pass>@<host>:<port>'
 * });
 * ```
 *
 * @constructor
 * @extends SessionStore
 * @param {Object} options
 * @param {Number} options.ttlSeconds
 *    If not set, expiration is not set.
 */
function RedisSessionStore(options) {
  options = options || {};

  if (options.url) {
    var url = require('url').parse(options.url);
    if (url.protocol === 'redis:') {
      if (url.auth) {
        var userParts = url.auth.split(":");
        options.user = userParts[0];
        if (userParts.length === 2) {
          options.password = userParts[1];
        }
      }
      options.host = url.hostname;
      options.port = url.port;
    }
  }

  SessionStore.call(this, options);

  this.client = null;
}

util.inherits(RedisSessionStore, SessionStore);

/**
 * @override
 */
RedisSessionStore.prototype.connect = function() {
  var options = this.options;

  this.client = redis.createClient(options.port || options.socket, options.host, options);
  this.client.on('error', _.bind(this.emit, this, 'disconnect'));
  this.client.on('connect', _.bind(this.emit, this, 'connect'));

  if (options.password) {
    this.client.auth(options.password, _.noop);
  }
};

/**
 * @override
 */
RedisSessionStore.prototype.get = function(key) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.client.get(key, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  }).then(function (result) {
    if (result && self.options.ttlSeconds) {
      // Update expiration time. No need to wait for the result.
      self.client.expire(key, self.options.ttlSeconds, _.noop);
    }
    return result;
  });
};

/**
 * @override
 */
RedisSessionStore.prototype.set = function(key, value) {
  var self = this;
  return new Promise(function(resolve, reject) {
    if (self.options.ttlSeconds) {
      self.client.setex(key, self.options.ttlSeconds, value, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      });
    } else {
      self.client.set(key, value, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      });
    }
  });
};

/**
 * @override
 */
RedisSessionStore.prototype.del = function(key) {
  var self = this;
  return new Promise(function(resolve, reject) {
    self.client.del(key, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(key);
      }
    });
  });
};

module.exports = RedisSessionStore;
