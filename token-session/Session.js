"use strict";

/**
 * An instance of this class is attached to each request when the `token-session` feature is used.
 *
 * @param {String} sessionString
 * @constructor
 */
function Session(sessionString) {
  if (sessionString) {
    var json = JSON.parse(sessionString);
    for (var key in json) {
      if (json.hasOwnProperty(key)) {
        this[key] = json[key];
      }
    }
  }
}

/**
 * @returns {String}
 */
Session.prototype.toString = function() {
  return JSON.stringify(this);
};

module.exports = Session;

