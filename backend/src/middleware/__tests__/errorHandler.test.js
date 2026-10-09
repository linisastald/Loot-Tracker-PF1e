const logger = require('../../utils/logger');
const { errorHandler, apiNotFoundHandler } = require('../errorHandler');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const req = { method: 'POST', path: '/login', originalUrl: '/api/auth/login?token=abc' };

describe('errorHandler', () => {
  const realEnv = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = realEnv; });

  it('keeps the CSRF contract: 403 "invalid csrf token"', () => {
    const res = makeRes();
    errorHandler(Object.assign(new Error('invalid csrf token'), { code: 'EBADCSRFTOKEN' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'invalid csrf token' });
  });

  it('answers malformed JSON with 400 and never echoes the parser message (it contains body text)', () => {
    const res = makeRes();
    const err = Object.assign(new SyntaxError("Unexpected token 'p', \"{password:hunter2\" is not valid JSON"), {
      status: 400, statusCode: 400, type: 'entity.parse.failed', expose: true
    });
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Malformed request body' });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('hunter2');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('hunter2');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers an oversized body with 413', () => {
    const res = makeRes();
    errorHandler(Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Request body too large' });
  });

  it('answers a CORS rejection with 403 and its public message', () => {
    const res = makeRes();
    errorHandler(Object.assign(new Error('Not allowed by CORS'), { status: 403, publicMessage: 'Not allowed by CORS' }), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Not allowed by CORS' });
  });

  it('logs 4xx at warn with status, type, method and the path without its query string', () => {
    errorHandler(Object.assign(new Error('x'), { status: 400, type: 'entity.parse.failed' }), req, makeRes(), jest.fn());
    expect(logger.warn).toHaveBeenCalledWith('Request rejected', {
      status: 400, type: 'entity.parse.failed', method: 'POST', path: '/api/auth/login'
    });
  });

  it('still answers unknown errors with 500, logs the stack, and hides the message in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    const err = new Error('db exploded');
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error', error: undefined });
    expect(logger.error).toHaveBeenCalledWith('Unhandled Error', expect.objectContaining({ stack: err.stack, method: 'POST' }));
  });

  it('treats a 5xx err.status as a 500 and an out-of-range status as a 500', () => {
    for (const status of [502, 200, 'abc', 99]) {
      const res = makeRes();
      errorHandler(Object.assign(new Error('x'), { status }), req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(500);
    }
  });

  it('delegates to the default handler when headers were already sent', () => {
    const next = jest.fn();
    const res = makeRes();
    res.headersSent = true;
    const err = new Error('late');
    errorHandler(err, req, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('apiNotFoundHandler', () => {
  it('returns the JSON 404 envelope for any method', () => {
    const res = makeRes();
    apiNotFoundHandler({ method: 'DELETE', originalUrl: '/api/nope/1?x=1' }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API endpoint not found', path: '/api/nope/1' });
  });
});
