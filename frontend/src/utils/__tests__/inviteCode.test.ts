import { describe, it, expect } from 'vitest';
import { INVITE_CODE_FORMAT_MESSAGE, INVITE_CODE_LENGTH, isValidInviteCode } from '../inviteCode';

describe('isValidInviteCode', () => {
  it('requires exactly 8 characters', () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
    expect(isValidInviteCode('ABCD2345')).toBe(true);
    expect(isValidInviteCode('ABCD1234')).toBe(true);
  });

  it.each(['', 'ABC', 'ABCDEF', 'ABCDEFG', 'ABCDEFGHI', 'ABCD-345', 'abcd2345', 'ABCD 345'])(
    'rejects %j',
    (value) => {
      expect(isValidInviteCode(value)).toBe(false);
    }
  );

  it('has a message that states the length', () => {
    expect(INVITE_CODE_FORMAT_MESSAGE).toBe('Invite codes are exactly 8 letters and numbers');
  });
});
