/**
 * Owner decision (2026-10-06): there is one canonical list of item types. The
 * backend list (ValidationService.ITEM_TYPES) and the frontend list
 * (ITEM_TYPES in itemOptions.ts) must never drift apart.
 */
const fs = require('fs');
const path = require('path');
const ValidationService = require('../validationService');

describe('item type lists', () => {
  it('backend ITEM_TYPES matches the frontend shared list', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../../frontend/src/utils/itemOptions.ts'),
      'utf8'
    );
    const block = source.split(/\r?\n/)
      .filter((line) => /^\s*\{ value: '/.test(line) && !/label: '(Fine|Diminutive)/.test(line))
      .map((line) => line.match(/value: '([^']+)'/)[1]);
    expect(block).toEqual(ValidationService.ITEM_TYPES);
  });
});
