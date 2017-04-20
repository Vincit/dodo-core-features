"use strict";

var _ = require('lodash')
  , ConflictError = require('dodo/errors').ConflictError;

/**
 * Handles errors thrown by the node-pg driver.
 *
 * See http://www.postgresql.org/docs/current/static/errcodes-appendix.html for possible PostgreSQL error codes.
 */
module.exports = function(error) {
  if (isPostgresError(error)) {
    if (error.code === "23503") {
      return parseForeignKeyViolationError(error);
    } else if (error.code === "23505") {
      return parseUniqueViolationError(error);
    }
  }
  return null;
};

/**
 * @private
 */
function isPostgresError(error) {
  if (!error) { return false; }
  // Just check the existence of a bunch of attributes. There doesn't seem to be an easier way.
  return _.every(['severity', 'code', 'detail', 'internalQuery', 'routine'], function(attr) {
    return _.has(error, attr);
  });
}

/**
 * @private
 */
function parseForeignKeyViolationError(err) {
  // Parse the failed attribute name and value from the error message.
  var attr = err.detail.match(/\((\w+)\)=/);
  var value = err.detail.match(/=\((\w+)\)/);
  var refTable = err.detail.match(/\"(\w+)\"/);

  if (attr.length !== 0 && value.length !== 0 && refTable.length !== 0) {
    // Use the values from RegExp capturing groups
    attr = attr[1];
    value = value[1];
    refTable = refTable[1];
    var message = 'Reference to "' + attr + '"="' + value + '" still exists in table "' + refTable + '"';

    var data = {};
    data[attr] = message;

    return new ConflictError(data).toJSON();
  }

  return null;
}

/**
 * @private
 */
function parseUniqueViolationError(err) {
  // Parse the failed attribute name and value from the error message.
  var attrs = err.detail.match(/\((.+)\)=/);
  var values = err.detail.match(/=\((.+)\)/);

  if (attrs.length !== 0 && values.length !== 0) {
    // Use the values from RegExp capturing groups
    attrs = attrs[1].split(', ');
    values = values[1].split(', ');

    var data = _.reduce(_.zipObject(attrs, values), function (result, value, attr) {
      // For some reason .replace('"', '') only removes one '"'.
      while (attr.indexOf('"') !== -1) {
        attr = attr.replace('"', '');
      }
      result[attr] = 'Entity with "' + attr + '"="' + value + '" already exists';
      return result;
    }, {});

    return new ConflictError(data).toJSON();
  }

  return null;
}
