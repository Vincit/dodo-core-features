var _ = require('lodash')
  , expect = require('expect.js')
  , Promise = require('bluebird')
  , Router = require('../router/Router')
  , HTTPError = require('nails/lib/errors/HTTPError')
  , AccessError = require('nails/lib/errors/AccessError');

describe('Router', function () {
  var request;
  var response;
  var mockExpressRouter;
  var router;

  beforeEach(function () {
    // Mock express request object.
    request = {
      user: {},
      // Mock express application.
      app: {
        config: {}
      }
    };
  });

  beforeEach(function () {
    // Mock express response object.
    response = {
      statusCode: 200,
      send: spy(function (data) {
        this.sentData = data;
        this.end();
        return this;
      }),
      set: spy(function () {
        return this;
      }),
      status: spy(function (statusCode) {
        this.statusCode = statusCode;
        return this;
      }),
      end: spy(function () {
        this.onEnd();
        return this;
      }),
      // This is not a response's method.
      onEnd: function () {
        // Implement this in tests.
      }
    };
  });

  beforeEach(function () {
    // Mock express Router object.
    mockExpressRouter = {
      get: createMockRouterMethod('get'),
      put: createMockRouterMethod('put'),
      post: createMockRouterMethod('post'),
      patch: createMockRouterMethod('patch'),
      delete: createMockRouterMethod('delete'),
      simulateRequest: function (req, res, next) {
        this.handler(req, res, next);
      }
    };
    function createMockRouterMethod(method) {
      return function (path, handler) {
        this.method = method;
        this.path = path;
        this.handler = handler;
      };
    }
  });

  beforeEach(function () {
    router = new Router(mockExpressRouter);
  });

  _.each(['get', 'put', 'post', 'delete', 'patch'], function (method) {

    describe('.' + method + '()', function () {

      it('should call ' + method + '() of the wrapped express router', function () {
        router[method]('/some/path').handler(_.noop);
        expect(mockExpressRouter.method).to.equal(method);
        expect(mockExpressRouter.path).to.equal('/some/path');
      });

      it('should be able to return json from handler', function (done) {
        var sendData = {some: 'data'};
        var transactionSpy = request.db.transaction;
        var endSpy = response.end;
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          expect(transactionSpy.calls).to.have.length(0);
          expect(endSpy.calls).to.have.length(1);
          expect(sendSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path').handler(function (req, res) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          return sendData;
        });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should be able to return a promise from handler', function (done) {
        var sendData = {some: 'data'};
        var transactionSpy = request.db.transaction;
        var endSpy = response.end;
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          expect(transactionSpy.calls).to.have.length(0);
          expect(endSpy.calls).to.have.length(1);
          expect(sendSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path').handler(function (req, res) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          return Promise.resolve(sendData);
        });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should be able to return a string from handler', function (done) {
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql('this is a string');
          expect(sendSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function () {
            return 'this is a string';
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should be able to return a string promise from handler', function (done) {
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql('this is a string');
          expect(sendSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function () {
            return Promise.resolve('this is a string');
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('handler should pass errors to the next middleware (sync)', function (done) {
        var error = new Error();
        var endSpy = response.end;
        var sendSpy = response.send;
        var transactionSpy = request.db.transaction;

        router[method]('/some/path').handler(function () {
          throw error;
        });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err).to.equal(error);
          // Should not have called response.end or response.send or started a transaction.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(transactionSpy.calls).to.have.length(0);
          done();
        });
      });

      it('handler should pass errors to the next middleware (async)', function (done) {
        var error = new Error();
        var endSpy = response.end;
        var sendSpy = response.send;
        var transactionSpy = request.db.transaction;

        router[method]('/some/path').handler(function () {
          return Promise.reject(error);
        });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err).to.equal(error);
          // Should not have called response.end or response.send or started a transaction.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(transactionSpy.calls).to.have.length(0);
          done();
        });
      });

      it('returning null should result in 404 response', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;

        router[method]('/some/path').handler(function () {
          return null;
        });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof HTTPError).to.equal(true);
          expect(err.statusCode).to.equal(404);
          // Should not have called response.end or response.send.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          done();
        });
      });

      it('should execute handler if all auth handlers return true', function (done) {
        var sendData = {some: 'data'};

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          done();
        };

        router[method]('/some/path')
          .auth(function (req) {
            expect(req).to.equal(request);
            return true;
          })
          .auth(function (req) {
            expect(req).to.equal(request);
            return true;
          })
          .auth(function (req) {
            expect(req).to.equal(request);
            return true;
          })
          .handler(function (req, res) {
            expect(req).to.equal(request);
            expect(res).to.equal(response);
            return sendData;
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should execute handler if auth handler returns a promise that evaluates to true', function (done) {
        var sendData = {some: 'data'};

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          done();
        };

        router[method]('/some/path')
          .auth(function (req) {
            expect(req).to.equal(request);
            return Promise.resolve(true);
          })
          .handler(function (req, res) {
            expect(req).to.equal(request);
            expect(res).to.equal(response);
            return sendData;
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('request handler and auth handler should share a request specific `this` context', function (done) {
        response.onEnd = function () {
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            expect(this).to.eql({});
            this.test = 100;
            return true;
          })
          .handler(function () {
            expect(this).to.eql({test: 100});
            return {};
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('auth handler should throw 401 HTTP error if session user is not found', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        delete request.user;

        router[method]('/some/path')
          .auth()
          .handler(handlerSpy);

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof HTTPError).to.equal(true);
          expect(err.statusCode).to.equal(401);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          done();
        });
      });

      it('auth handler should throw 202 HTTP error instead of 401 if set via unauthenticatedStatusCode', function (done) {
        delete request.user;

        router = new Router(mockExpressRouter, null, 202);
        router[method]('/some/path')
          .auth()
          .handler(_.noop);

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof HTTPError).to.equal(true);
          expect(err.statusCode).to.equal(202);
          done();
        });
      });

      it('should throw 403 HTTP error if auth handler returns false', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        router[method]('/some/path')
          .auth(function () {
            return false;
          })
          .handler(handlerSpy);

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          done();
        });
      });

      it('should throw 403 HTTP error if any of the auth handlers return a promise that evaluates to false', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .auth(function () {
            return Promise.resolve(true);
          })
          .auth(function () {
            return Promise.resolve(false);
          })
          .handler(handlerSpy);

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          done();
        });
      });

      it('should use the defaultAuthHandler if defined', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        var defaultAuthHandlerSpy = spy(function (req) {
          expect(req).to.equal(request);
          return false;
        });

        router = new Router(mockExpressRouter, defaultAuthHandlerSpy);
        router[method]('/some/path').handler(handlerSpy);

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          expect(defaultAuthHandlerSpy.calls).to.have.length(1);
          done();
        });
      });

      it('should remove all authentication if `.public` is called', function (done) {
        var sendData = {some: 'data'};

        var defaultAuthHandlerSpy = spy(function () {
          return false;
        });

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          expect(defaultAuthHandlerSpy.calls).to.have.length(0);
          done();
        };

        router = new Router(mockExpressRouter, defaultAuthHandlerSpy);
        router[method]('/some/path')
          .auth(function () {
            return false;
          })
          .public()
          .handler(function () {
            return sendData;
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should start a transaction if the handler takes three arguments', function (done) {
        var sendData = {some: 'data'};
        var transactionSpy = request.db.transaction;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          expect(transactionSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path')
          .auth(function (req, trx) {
            expect(req).to.equal(request);
            expect(trx).to.equal(transaction);
            return true;
          })
          .handler(function (req, res, trx) {
            expect(req).to.equal(request);
            expect(res).to.equal(response);
            expect(trx).to.equal(transaction);
            return sendData;
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('transaction.commit should be called and the transaction should end before res.end is called', function (done) {
        var sendData = {some: 'data'};
        var transactionSpy = request.db.transaction;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify(sendData));
          expect(transactionSpy.calls).to.have.length(1);
          expect(transaction.commit.calls).to.have.length(1);
          expect(transaction.rollback.calls).to.have.length(0);
          expect(transactionEnded).to.equal(true);
          done();
        };

        router[method]('/some/path')
          .auth(function (req, trx) {
            expect(req).to.equal(request);
            expect(trx).to.equal(transaction);
            expect(transactionEnded).to.equal(false);
            return true;
          })
          .handler(function (req, res, trx) {
            expect(req).to.equal(request);
            expect(res).to.equal(response);
            expect(trx).to.equal(transaction);
            expect(transactionEnded).to.equal(false);
            return Promise.delay(100).then(function () {
              expect(transaction.commit.calls).to.have.length(0);
              expect(transaction.rollback.calls).to.have.length(0);
              expect(transactionEnded).to.equal(false);
              return sendData;
            });
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should not need return value if res.send is called in the handler', function (done) {
        var sendData = {some: 'data'};
        var endSpy = response.end;
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(304);
          expect(this.sentData).to.eql(sendData);
          expect(endSpy.calls).to.have.length(1);
          expect(sendSpy.calls).to.have.length(1);
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function (req, res) {
            res.status(304).send(sendData);
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should not need return value if res.end is called in the handler', function (done) {
        var endSpy = response.end;
        var sendSpy = response.send;

        response.onEnd = function () {
          expect(this.statusCode).to.equal(304);
          expect(this.sentData).to.eql(undefined);
          expect(endSpy.calls).to.have.length(1);
          expect(sendSpy.calls).to.have.length(0);
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function (req, res) {
            setTimeout(function () {
              res.status(304).end();
            }, 10);
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('should be able to register express middleware', function (done) {
        var sendSpy = response.send;
        var middlewareSpy = spy(function (req, res, next) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          setTimeout(next, 20);
        });

        response.onEnd = function () {
          expect(this.statusCode).to.equal(200);
          expect(this.sentData).to.eql(JSON.stringify({some: 'data'}));
          expect(sendSpy.calls).to.have.length(1);
          expect(middlewareSpy.calls).to.have.length(2);
          done();
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .middleware(middlewareSpy)
          .middleware(middlewareSpy)
          .handler(function () {
            return {some: 'data'};
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          done(err);
        });
      });

      it('failing express middleware should call next() with an error', function (done) {
        var error = new Error();

        var middlewareSpy = spy(function (req, res, next) {
          setTimeout(function () {
            next(error);
          }, 20);
        });

        response.onEnd = function () {
          done(new Error('should not get here'));
        };

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .middleware(middlewareSpy)
          .middleware(middlewareSpy)
          .handler(function () {
            done(new Error('should not get here'));
          });

        mockExpressRouter.simulateRequest(request, response, function (err) {
          expect(err).to.equal(error);
          expect(middlewareSpy.calls).to.have.length(1);
          done();
        });
      });

    });
  });

  function spy(func) {
    func = func || _.noop;
    var calls = [];

    var wrapper = function () {
      calls.push(_.map(arguments, function (value) {
        return value;
      }));
      return func.apply(this, arguments);
    };

    wrapper.calls = calls;
    return wrapper;
  }

});
