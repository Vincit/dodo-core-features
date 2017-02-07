"use strict";

var HTTPError = require('dodo/errors').HTTPError;

/**
 * Handles all `HTTPErrors` and errors that have `statusCode` property.
 */
module.exports = function(error) {
  if (!error) {
    return null;
  }

  if (error instanceof HTTPError) {
    return error.toJSON();
  }

  var statusCode = error.statusCode || error.httpStatusCode || error.HTTPStatusCode;
  if (statusCode) {
    return new HTTPError(statusCode, error.data || {}).toJSON();
  }
  
  return null;
};
