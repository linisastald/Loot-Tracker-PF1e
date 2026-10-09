/**
 * Runs before setupTests.js (setupFiles in jest.unit.config.js): environment only.
 * Console output is deliberately NOT filtered, so a stray console.log or console.error
 * in application code stays visible.
 */

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'mock-openai-key';
process.env.JWT_SECRET = 'mock-jwt-secret-for-testing';
