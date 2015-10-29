"use strict";

var _ = require('lodash')
  , EventEmitter = require('events').EventEmitter
  , util = require('util');

/**
 * Objects of this class can store session information.
 *
 * There are two events the subclasses must emit: `connect` and `disconnect`. `connect` must be emitted
 * each time the connection is established and the store becomes ready to use. `disconnect` must be
 * emitted each time the connection is lost.
 *
 * @constructor
 * @extends EventEmitter
 * @param {Object} options
 */
function SessionStore(options) {
  EventEmitter.call(this);
  this.options = options || {};
}

util.inherits(SessionStore, EventEmitter);

/**
 * Starts asynchronous connecting process.
 *
 * `connect` event must be emitted after successful connection.
 */
SessionStore.prototype.connect = function() {
  // Default implementation that works out of the box when there is nothing to connect to.
  process.nextTick(_.bind(this.emit, this, 'connect'));
};

/**
 * Fetches a value for a key.
 *
 * @param {String} key
 * @return {Promise}
 */
SessionStore.prototype.get = function(key) {
  _.noop(key);
  throw new Error(this.constructor.name + '.get not implemented');
};

/**
 * Stores a key-value pair.
 *
 * @param {String} key
 * @param {String} value
 * @return {Promise}
 */
SessionStore.prototype.set = function(key, value) {
  _.noop(key, value);
  throw new Error(this.constructor.name + '.set not implemented');
};

/**
 * Removes a key-value pair.
 *
 * @param {String} key
 * @return {Promise}
 */
SessionStore.prototype.del = function(key) {
  _.noop(key);
  throw new Error(this.constructor.name + '.del not implemented');
};

module.exports = SessionStore;
