// src/utils/inviteRules.js
//
// Redeemability rules shared by the two redemption paths (registration in
// authController and redeeming as an existing user in inviteController), so
// the checks and the error messages cannot drift apart.
const controllerFactory = require('./controllerFactory');

/**
 * Throw a validation error unless the invite exists, is unused and has not
 * expired. An unknown and a used code get the same message on purpose.
 *
 * @param {Object|null} invite - Row from Invite.findByCode (or null)
 * @return {Object} The same invite, for chaining
 * @throws {Error} Validation error (400) when the invite cannot be redeemed
 */
const assertRedeemable = (invite) => {
  if (!invite || invite.is_used) {
    throw controllerFactory.createValidationError('Invalid or used invite code');
  }
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
    throw controllerFactory.createValidationError('This invitation code has expired');
  }
  return invite;
};

module.exports = { assertRedeemable };
