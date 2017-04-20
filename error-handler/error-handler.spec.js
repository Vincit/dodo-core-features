var _ = require('lodash')
  , expect = require('expect.js')
  , Promise = require('bluebird')
  , sinon = require('sinon')
  , middleware = require('.')
  , logger = require('dodo/logger')
  , HttpError = require('dodo/errors').HTTPError
  ;

var mockApp = {
  use: function (cb) {
    mockApp.expressHandler = cb;
  },
};

var mockReq = {
  app: {
    config: {
      profile: 'production'
    }
  }
}

var mockRes = {
  status: function (code) {
    mockRes.lastStatus = code;
    return {
      json: function (err) {
        mockRes.lastErr = err;
      }
    }
  }
}

var config = {
  headerPaths: [
    './handlers'
  ],
  handlers: [
    'http',
    'postgres',
    'sqlite'
  ]
};

describe('error-handlers express middleware', function () {

  var mockLogger = new logger.MockHandler();

  before(function () {
    // register middleware to mockapp
    middleware(mockApp, config);

    logger.LogHub.clearHandlers();
    logger.LogHub.setHandler([
      logger.level.trace,
      logger.level.debug,
      logger.level.info,
      logger.level.warning,
      logger.level.error,
    ], '', mockLogger);
  });

  beforeEach(function () {
    mockLogger.flush();
  });

  it('should call next if no error', function () {
    var next = sinon.spy();
    mockApp.expressHandler(undefined, mockReq, mockRes, next);
    expect(next.called).to.be.ok();
  });

  it('should pass HTTP error 500 if no special handler found', function () {
    var next = sinon.spy();
    var theError = new Error();
    mockApp.expressHandler(theError, mockReq, mockRes, next);
    expect(next.called).to.not.be.ok();
    expect(mockLogger.logs).to.have.length(1);
    expect(mockLogger.logs[0].metadata.error).to.be(theError);
  });

  it('should create http error response if error has statusCode, httpStatusCode or HTTPStatusCode attribute', function () {
    var theError = new Error();
    theError.statusCode = 404;
    theError.data = 'Got the data';
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.name).to.be('Not Found');
    expect(mockRes.lastErr.data).to.be(theError.data);

    theError = new Error();
    theError.httpStatusCode = 404;
    theError.data = 'Got the data';
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.name).to.be('Not Found');
    expect(mockRes.lastErr.data).to.be(theError.data);

    var theError = new Error();
    theError.HTTPStatusCode = 404;
    theError.data = 'Got the data';
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.name).to.be('Not Found');
    expect(mockRes.lastErr.data).to.be(theError.data);

    var theError = new Error();
    theError.status = 404;
    theError.data = 'Got the data';
    mockLogger.flush();
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.name).to.be('Internal Server Error');
    expect(mockRes.lastErr.data).to.be(null);
    expect(mockLogger.logs).to.have.length(1);
  });

  it('should parse sqlite unique violation error', function () {
    var theError = new Error('SQLITE_CONSTRAINT: UNIQUE diipadaa dappa huh.hah.hei');
    theError.errno = 19;
    theError.code = 'SQLITE_WAT';
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.data.hah).to.be.ok();
    expect(mockRes.lastErr.statusCode).to.be(409);
  });

  it('should match parseForeignKeyViolationError postgres error', function () {
    var theError = new Error('SQLITE_CONSTRAINT: UNIQUE diipadaa dappa huh.hah.hei');
    theError.severity = 'pretty bad';
    theError.code = '23503';
    theError.detail = '(nasty)=(somthing) "poopy" did hit the fan';
    theError.internalQuery = 'select * from fan where not poo';
    theError.routine = 1;
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.data.nasty).to.be.ok();
    expect(mockRes.lastErr.statusCode).to.be(409);
  });

  it('should match parseUniqueViolationError postgres error', function () {
    var theError = new Error('SQLITE_CONSTRAINT: UNIQUE diipadaa dappa huh.hah.hei');
    theError.severity = 'pretty bad';
    theError.code = '23505';
    theError.detail = '(nasty)=(somthing) "poopy" did hit the fan';
    theError.internalQuery = 'select * from fan where not poo';
    theError.routine = 1;
    mockApp.expressHandler(theError, mockReq, mockRes, null);
    expect(mockRes.lastErr.data.nasty).to.contain('already exists');
    expect(mockRes.lastErr.statusCode).to.be(409);
  });
});
