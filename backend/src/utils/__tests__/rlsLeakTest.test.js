/**
 * The RLS leak-test script must only count a cross-campaign INSERT as proof when PostgreSQL
 * rejected it with a row-level security violation (F-0085, F-0086).
 */
const { isRlsViolation } = require('../../../scripts/rls-leak-test');

describe('rls-leak-test isRlsViolation', () => {
  it('accepts the row-level security violation', () => {
    const error = Object.assign(new Error('new row violates row-level security policy for table "gold"'), { code: '42501' });
    expect(isRlsViolation(error)).toBe(true);
  });

  it('rejects a plain permission-denied error (missing grant)', () => {
    const error = Object.assign(new Error('permission denied for table gold'), { code: '42501' });
    expect(isRlsViolation(error)).toBe(false);
  });

  it('rejects NOT NULL, foreign-key and check violations', () => {
    expect(isRlsViolation(Object.assign(new Error('null value in column "x" violates not-null constraint'), { code: '23502' }))).toBe(false);
    expect(isRlsViolation(Object.assign(new Error('violates foreign key constraint'), { code: '23503' }))).toBe(false);
    expect(isRlsViolation(Object.assign(new Error('new row for relation "gold" violates check constraint'), { code: '23514' }))).toBe(false);
  });

  it('rejects an error without a code and a missing error', () => {
    expect(isRlsViolation(new Error('row-level security'))).toBe(false);
    expect(isRlsViolation(null)).toBe(false);
  });
});
