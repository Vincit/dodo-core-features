"use strict";

var _ = require('lodash')
  , _str = require('underscore.string')
  , ConflictError = require('dodo/lib/errors/ConflictError');

/**
 * Handles errors thrown by the node-sqlite3 driver.
 */
module.exports = function(error) {
  if (isSqliteError(error)) {
    if (parseInt(error.errno, 10) === 19) {
      return parseUniqueViolationError(error);
    }
  }
  return null;
};

/**
 * @private
 */
function isSqliteError(error) {
  if (!error) { return false; }
  return _.has(error, 'errno') && _.has(error, 'code') && _str.startsWith(error.code, 'SQLITE_');
}

/**
 * @private
 */
function parseUniqueViolationError(err) {
  var msg = err.message;
  var words = _str.words(msg);

  if (words.length === 5 && words[0] === 'SQLITE_CONSTRAINT:' && words[1] === 'UNIQUE') {
    var obj = {};
    obj[words[4].split('.')[1]] = msg;
    return new ConflictError(obj).toJSON();
  }

  return null;
}
