var express = require('express');
var app = express();

var http = require('http')
  , expect = require('expect.js')
  , Promise = require('bluebird')
  ;

var Router = require('../router/Router');
var request = require('dodo/http').request;

app.config = {
  profile: 'production'
};

var somethingFailedAtSomePoint = null;

function testRouter(router, app) {

  router.get('/awesome')
    .public()
    .customResponse()
    .handler(function (req, res) {
      return Promise.delay(10).then(function () {
        if (res.headersSent) {
          somethingFailedAtSomePoint = 'Headers was sent at some point.';
        }
        res.send({ im: 'awesome' });
        if (!res.headersSent) {
          somethingFailedAtSomePoint = 'res.headersSent was not set :o';
        }
      });
    });

  router.get('/normal')
    .public()
    .handler(function (req, res) {
      return Promise.delay(10).then(function () {
        return { im: 'normal' };
      });
    });

};

describe('Router integration testing with express running', function () {
  var server;
  var port;
  var requ;

  before('setup router', function () {
    expressRouter = express.Router();
    router = new Router(expressRouter, null, 403);
    app.use('/', expressRouter);
    testRouter(router, app);

    return new Promise(function (resolve, reject) {
      server = http.createServer(app);
      server.listen(function () {
        port = server.address().port;
        resolve();
      });
    });
  });

  before(function () {
    requ = request('http://localhost:' + port);
  });

  after('shutdown', function () {
    server.close();
  });

  it('should start and stop and wait for promise returned from .customResponse() route', function () {
    return requ.get('/awesome').then(function (res) {
      expect(res.body.im).to.be('awesome');
    });
  });

  it('should never run row that say this should never happen', function () {
    var errorCount = 0;

    for (var i = 1; i < 10; i++) {
      requ.get('/awesome').timeout(i).then(function (res) {
        expect(true).to.be.false();
      }).catch(function (err) {
        expect(err.message).to.contain('hang up');
        errorCount += 1;
      });

      requ.get('/normal').timeout(i).then(function (res) {
        expect(true).to.be.false();
      }).catch(function (err) {
        expect(err.message).to.contain('hang up');
        errorCount += 1;
      });
    }
    
    return Promise.delay(100).then(function () {
      expect(errorCount).to.equal(18);
      expect(somethingFailedAtSomePoint).to.be(null);
    });
  });


});