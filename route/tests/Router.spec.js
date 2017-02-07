var _ = require('lodash')
  , expect = require('expect.js')
  , Promise = require('bluebird')
  , Router = require('../router/Router')
  , HTTPError = require('dodo/errors').HTTPError
  , AccessError = require('dodo/errors').AccessError;

describe('Router', function () {
  var request;
  var response;
  var mockExpressRouter;
  var router;

  beforeEach(function () {
    // Mock express request object.
    request = {
      // Mock express application.
      app: {
        config: {
        }
      }
    };
  });

  beforeEach(function () {
    // Mock express response object.
    response = {
      headersSent: false,
      statusCode: 200,
      send: spy(function (data) {
        this.sentData = data;
        this.headersSent = true;
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

  function failIfNext() {
    throw new Error("Next shouldn't have been called");
  }

  beforeEach(function () {
    // Mock express Router object.
    mockExpressRouter = {
      get: createMockRouterMethod('get'),
      put: createMockRouterMethod('put'),
      post: createMockRouterMethod('post'),
      patch: createMockRouterMethod('patch'),
      delete: createMockRouterMethod('delete'),
      simulateRequest: function (req, res, next) {
        return Promise.resolve(this.handler(req, res, next));
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
    var publicByDefaultHandler = function publicByDefault(req) {
      return true;
    };
    router = new Router(mockExpressRouter, publicByDefaultHandler);
  });

  _.each(['get', 'put', 'post', 'delete', 'patch'], function (method) {

    describe('.' + method + '()', function () {

      it('should fail if .middleware is called after .handler', function () {
        expect(function () {
          router[method]('/some/path')
            .handler(function (req, res) {})
            .middleware(function (req, res, next) {});
        }).to.throwError();
      });

      it('should fail if .auth is called after .handler', function () {
        expect(function () {
          router[method]('/some/path')
            .handler(function (req, res) {})
            .auth(function (req, res, next) {});
        }).to.throwError();
      });

      it('should fail if .handler is called twice', function () {
        expect(function () {
          router[method]('/some/path')
            .handler(function (req, res) {})
            .handler(function (req, res) {});
        }).to.throwError();
      });

      it('should call ' + method + '() of the wrapped express router', function () {
        router[method]('/some/path').handler(_.noop);
        expect(mockExpressRouter.method).to.equal(method);
        expect(mockExpressRouter.path).to.equal('/some/path');
      });

      it('should be able to return json from handler', function () {
        var sendData = {some: 'data'};

        router[method]('/some/path').handler(function (req, res) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          return sendData;
        });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify(sendData));
          });
      });

      it('should be able to return a promise from handler', function () {
        var sendData = {some: 'data'};

        router[method]('/some/path').handler(function (req, res) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          return Promise.resolve(sendData);
        });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify(sendData));
          });
      });

      it('should be able to return a string from handler', function () {
        var sendSpy = response.send;

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function () {
            return 'this is a string';
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql('this is a string');
            expect(sendSpy.calls).to.have.length(1);
          });
      });

      it('should fail if invalid value is returned from .auth handler', function () {
        var sendSpy = response.send;

        router[method]('/some/path')
          .auth(function () {
            return 50;
          })
          .handler(function () {
          });

        var nextSpy = spy(function (err) {
          expect(err.message).to.contain('Invalid return value from auth handler');
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should send buffer nicely', function () {
        var sendSpy = response.send;

        router[method]('/some/path')
          .handler(function () {
            return new Buffer('nice', 'utf-8');
          });

        var nextSpy = spy(function (err) {
          expect(err.message).to.contain('Invalid return value from auth handler');
        });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.sentData).to.be.a(Buffer);
          });
      });

      it('should be able to return a string promise from handler', function () {
        var sendSpy = response.send;

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .handler(function () {
            return Promise.resolve('this is a string');
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql('this is a string');
            expect(sendSpy.calls).to.have.length(1);
          });
      });

      it('handler should pass errors to the next middleware (sync)', function () {
        var error = new Error();

        router[method]('/some/path').handler(function () {
          throw error;
        });

        var nextSpy = spy(function (err) {
          expect(err).to.equal(error);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('handler should pass errors to the next middleware (async)', function () {
        var error = new Error();

        router[method]('/some/path').handler(function () {
          return Promise.reject(error);
        });

        var nextSpy = spy(function (err) {
          expect(err).to.equal(error);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('returning null should result in 404 response', function () {
        var endSpy = response.end;
        var sendSpy = response.send;

        router[method]('/some/path').handler(function () {
          return null;
        });

        var nextSpy = spy(function (err) {
          expect(err instanceof HTTPError).to.equal(true);
          expect(err.statusCode).to.equal(404);
          // Should not have called response.end or response.send.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should execute handler if all auth handlers return true', function () {
        var sendData = {some: 'data'};

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

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify(sendData));
          });
      });

      it('should execute handler if auth handler returns a promise that evaluates to true', function () {
        var sendData = {some: 'data'};

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

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify(sendData));
          });
      });

      it('request handler and auth handler should share a request specific `this` context', function () {
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

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.headersSent).to.be(true);
          });
      });

      it('returning error from auth handler throws certain error and not the default AccessError', function () {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        router.defaultAuthHandler = function (req) {
          return new Error("custom error");
        };
        router[method]('/some/path')
          .handler(handlerSpy);

        var nextSpy = spy(function (err) {
          expect(err instanceof Error).to.equal(true);
          expect(err.message).to.equal("custom error");
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          expect(response.headersSent).to.be(false);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('auth handler should throw error if there is no default access handler and route is not set public', function () {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        delete router.defaultAuthHandler;
        router[method]('/some/path')
          .handler(handlerSpy);

        var nextSpy = spy(function (err) {
          expect(err instanceof Error).to.equal(true);
          expect(err.message).to.equal("No defaultAuthHandler set for non-public route.");
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should throw 403 HTTP error if auth handler returns false', function () {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        router[method]('/some/path')
          .auth(function () {
            return false;
          })
          .handler(handlerSpy);

        var nextSpy = spy(function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should throw 403 HTTP error if any of the auth handlers return a promise that evaluates to false', function () {
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

        var nextSpy = spy(function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should use the defaultAuthHandler if defined', function () {
        var endSpy = response.end;
        var sendSpy = response.send;
        var handlerSpy = spy();

        var defaultAuthHandlerSpy = spy(function (req) {
          expect(req).to.equal(request);
          return false;
        });

        router = new Router(mockExpressRouter, defaultAuthHandlerSpy);
        router[method]('/some/path').handler(handlerSpy);

        var nextSpy = spy(function (err) {
          expect(err instanceof AccessError).to.equal(true);
          expect(err.statusCode).to.equal(403);
          // Should not have called response.end or response.send or the handler.
          expect(endSpy.calls).to.have.length(0);
          expect(sendSpy.calls).to.have.length(0);
          expect(handlerSpy.calls).to.have.length(0);
          expect(defaultAuthHandlerSpy.calls).to.have.length(1);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should remove all authentication if `.public` is called', function () {
        var sendData = {some: 'data'};

        var defaultAuthHandlerSpy = spy(function () {
          return false;
        });

        router = new Router(mockExpressRouter, defaultAuthHandlerSpy);
        router[method]('/some/path')
          .auth(function () {
            return false;
          })
          .public()
          .handler(function () {
            return sendData;
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify(sendData));
            expect(defaultAuthHandlerSpy.calls).to.have.length(0);
          });
      });


      it('should not need return value if res.send is called in the handler (async)', function () {
        var sendData = {some: 'data'};
        var endSpy = response.end;
        var sendSpy = response.send;

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .customResponse()
          .handler(function (req, res) {
            return Promise.resolve().then(function () {
              res.status(304).send(sendData);
            });
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(304);
            expect(response.sentData).to.eql(sendData);
            expect(endSpy.calls).to.have.length(1);
            expect(sendSpy.calls).to.have.length(1);
          });
      });

      it('should not need return value if res.send is called in the handler (sync)', function () {
        var sendData = {some: 'data'};
        var endSpy = response.end;
        var sendSpy = response.send;

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .customResponse()
          .handler(function (req, res) {
            res.status(304).send(sendData);
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(304);
            expect(response.sentData).to.eql(sendData);
            expect(endSpy.calls).to.have.length(1);
            expect(sendSpy.calls).to.have.length(1);
          });
      });

      it('should fail if res.send is not called in the handler and .customResponse() is declared', function () {
        var endSpy = response.end;
        var sendSpy = response.send;

        router[method]('/some/path')
          .customResponse()
          .auth(function () {
            return true;
          })
          .handler(function (req, res) {
          });

        var nextSpy = spy(function (err) {
          expect(err.message).to.contain('Handler function did not return promise');
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
          });
      });

      it('should be able to register express middleware', function () {
        var sendSpy = response.send;
        var middlewareSpy = spy(function (req, res, next) {
          expect(req).to.equal(request);
          expect(res).to.equal(response);
          setTimeout(next, 20);
        });

        router[method]('/some/path')
          .auth(function () {
            return true;
          })
          .middleware(middlewareSpy)
          .middleware(middlewareSpy)
          .handler(function () {
            return {some: 'data'};
          });

        return mockExpressRouter.simulateRequest(request, response, failIfNext)
          .then(function () {
            expect(response.statusCode).to.equal(200);
            expect(response.sentData).to.eql(JSON.stringify({some: 'data'}));
            expect(sendSpy.calls).to.have.length(1);
            expect(middlewareSpy.calls).to.have.length(2);
          });
      });

      it('failing express middleware should call next() with an error', function () {
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

        var nextSpy = spy(function (err) {
          expect(err).to.equal(error);
          expect(middlewareSpy.calls).to.have.length(1);
        });

        return mockExpressRouter.simulateRequest(request, response, nextSpy)
          .then(function () {
            expect(nextSpy.calls).to.have.length(1);
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
