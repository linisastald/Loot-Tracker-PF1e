// src/utils/passwordPolicy.js
// The one password policy and hashing routine, shared by registration, token
// reset, change-password and the test-data seeder, so the env-configurable
// length limits and the bcrypt cost cannot drift apart.
const bcrypt = require('bcryptjs');
const controllerFactory = require('./controllerFactory');
const { AUTH } = require('../config/constants');

/** bcrypt cost factor for stored passwords. */
const BCRYPT_ROUNDS = 10;

/**
 * Enforce the password length policy (AUTH.PASSWORD_MIN_LENGTH / MAX_LENGTH).
 * @param {string} password
 * @throws {Error} Validation error (400)
 */
const assertPasswordPolicy = (password) => {
    if (!password || password.length < AUTH.PASSWORD_MIN_LENGTH) {
        throw controllerFactory.createValidationError(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters long`);
    }
    if (password.length > AUTH.PASSWORD_MAX_LENGTH) {
        throw controllerFactory.createValidationError(`Password cannot exceed ${AUTH.PASSWORD_MAX_LENGTH} characters`);
    }
};

/** NFC-normalize and bcrypt-hash a password. */
const hashPassword = (password) => bcrypt.hash(password.normalize('NFC'), BCRYPT_ROUNDS);

module.exports = {BCRYPT_ROUNDS, assertPasswordPolicy, hashPassword};
