/**
 * Shared Express req/res mocks for controller unit tests.
 *
 * The res mock mirrors apiResponseMiddleware (success/created/error/
 * validationError/notFound/forbidden) and chains status()/json().
 */

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  res.success = jest.fn((data = null, message = 'Operation successful') => {
    res.status(200);
    res.json({ success: true, message, data });
    return res;
  });

  res.created = jest.fn((data = null, message = 'Resource created successfully') => {
    res.status(201);
    res.json({ success: true, message, data });
    return res;
  });

  res.error = jest.fn((message = 'An error occurred', statusCode = 500, errors = null) => {
    res.status(statusCode);
    res.json({ success: false, message, errors });
    return res;
  });

  res.validationError = jest.fn((errors) => {
    const message = typeof errors === 'string' ? errors : 'Validation error';
    res.status(400);
    res.json({ success: false, message });
    return res;
  });

  res.notFound = jest.fn((message = 'Resource not found') => {
    res.status(404);
    res.json({ success: false, message });
    return res;
  });

  res.forbidden = jest.fn((message = 'Access forbidden') => {
    res.status(403);
    res.json({ success: false, message });
    return res;
  });

  return res;
}

/**
 * Build a request. Mirrors verifyToken: the per-campaign role (campaignRole)
 * defaults to the user's role.
 */
function createMockReq(overrides = {}) {
  const req = {
    body: {},
    params: {},
    query: {},
    cookies: {},
    user: { id: 1, role: 'Player' },
    ...overrides,
  };
  if (req.campaignRole === undefined && req.user) req.campaignRole = req.user.role;
  return req;
}

module.exports = { createMockRes, createMockReq };
