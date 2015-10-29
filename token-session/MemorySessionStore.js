"use strict";

var _ = require('lodash')
  , util = require('util')
  , Promise = require('bluebird')
  , SessionStore = require('./SessionStore');

/**
 * `SessionStore` that saves the session to memory.
 *
 * @note The sessions are never removed from the memory. Use this only for testing and developing purposes.
 *
 * Examples:
 *
 * ```js
 * var store = new MemorySessionStore();
 * ```
 *
 * @constructor
 * @extends SessionStore
 * @param {Object} options
 */
function MemorySessionStore(options) {
  SessionStore.call(this, options);
  this.data = {};
}

util.inherits(MemorySessionStore, SessionStore);

/**
 * @override
 */
MemorySessionStore.prototype.connect = function() {
  var self = this;
  process.nextTick(function() {
    self.emit('connect');
  });
};

/**
 * @override
 */
MemorySessionStore.prototype.get = function(key) {
  return Promise.resolve(this.data[key]);
};

/**
 * @override
 */
MemorySessionStore.prototype.set = function(key, value) {
  this.data[key] = value;
  return Promise.resolve(value);
};

/**
 * @override
 */
MemorySessionStore.prototype.del = function(key) {
  delete this.data[key];
  return Promise.resolve(key);
};

module.exports = MemorySessionStore;