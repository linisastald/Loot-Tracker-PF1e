// The one definition of the invite code shape on the client. Codes are exactly
// INVITE_CODE_LENGTH uppercase letters/digits; legacy 6- and 7-character codes
// were retired server-side (migration 067). The server keeps its own copy in
// backend/src/utils/inviteCode.js.

export const INVITE_CODE_LENGTH = 8;

const INVITE_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${INVITE_CODE_LENGTH}}$`);

/** Shown when a code cannot possibly be valid. */
export const INVITE_CODE_FORMAT_MESSAGE = `Invite codes are exactly ${INVITE_CODE_LENGTH} letters and numbers`;

/** Whether the (already trimmed and uppercased) value has the shape of an invite code. */
export const isValidInviteCode = (value: string): boolean => INVITE_CODE_PATTERN.test(value);
