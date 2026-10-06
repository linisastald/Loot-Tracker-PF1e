/**
 * Global Express error handler and the JSON 404 for unknown API routes.
 */
const http = require('http');
const logger = require('../utils/logger');

// Messages for errors raised by body-parser. The parser's own message is never
// returned or logged: for a JSON syntax error it quotes part of the request
// body, which can hold a password.
const BODY_PARSER_MESSAGES = {
  'entity.parse.failed': 'Malformed request body',
  'entity.too.large': 'Request body too large',
  'encoding.unsupported': 'Unsupported content encoding',
  'charset.unsupported': 'Unsupported charset',
  'request.aborted': 'Request aborted',
  'request.size.invalid': 'Invalid request size',
  'parameters.too.many': 'Too many parameters'
};

// Request path without the query string (query strings can carry tokens).
const pathOf = (req) => String(req.originalUrl || req.path || '').split('?')[0];

// 4xx status carried by the error (body-parser, cors and http-errors set it).
const clientErrorStatus = (err) => {
  const status = err.status ?? err.statusCode;
  return Number.isInteger(status) && status >= 400 && status < 500 ? status : null;
};

const errorHandler = (err, req, res, next) => {
  // Once the response has started Express must close the connection itself.
  if (res.headersSent) {
    return next(err);
  }

  // Handle CSRF token errors (must return 'invalid csrf token' for frontend compatibility)
  if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
    logger.warn('CSRF token validation failed', { method: req.method, path: req.path });
    return res.status(403).json({
      success: false,
      message: 'invalid csrf token'
    });
  }

  // Client errors (malformed JSON, oversized body, CORS rejection) keep their
  // own status instead of being reported as a server fault.
  const status = clientErrorStatus(err);
  if (status) {
    logger.warn('Request rejected', { status, type: err.type, method: req.method, path: pathOf(req) });
    return res.status(status).json({
      success: false,
      message: err.publicMessage || BODY_PARSER_MESSAGES[err.type] || http.STATUS_CODES[status] || 'Bad request'
    });
  }

  logger.error('Unhandled Error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path
  });

  // Send error response
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// Mounted after every API router: any /api path nothing handled gets the
// standard JSON envelope (any method, any NODE_ENV) instead of Express's HTML 404.
const apiNotFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: pathOf(req)
  });
};

module.exports = { errorHandler, apiNotFoundHandler };
