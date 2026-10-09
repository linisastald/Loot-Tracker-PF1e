// src/utils/inviteCode.js
//
// The one definition of the invite code shape on the server. Codes are
// generated with exactly CODE_LENGTH characters (models/Invite.js); the
// registration and redeem endpoints accept exactly that shape. Legacy 6- and
// 7-character codes were retired by migration 067. The frontend keeps its own
// copy in frontend/src/utils/inviteCode.ts.

/** Number of characters in an invite code. */
const CODE_LENGTH = 8;

/** Shape of a code after trimming and uppercasing. */
const CODE_PATTERN = new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`);

/** Message for a code that cannot possibly be valid (wrong length or characters). */
const CODE_FORMAT_MESSAGE = `Invite codes are exactly ${CODE_LENGTH} letters and numbers`;

module.exports = { CODE_LENGTH, CODE_PATTERN, CODE_FORMAT_MESSAGE };
