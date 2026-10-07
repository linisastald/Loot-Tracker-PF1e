// src/utils/authSession.js
// Session-cookie helpers shared by the auth and user controllers and the auth
// middleware: issuing the auth cookie and deciding whether a token predates a
// password change.
const jwt = require('jsonwebtoken');
const { AUTH, COOKIES } = require('../config/constants');

/** Cookie flags shared by setting and clearing the auth cookie. */
const AUTH_COOKIE_OPTIONS = {
    httpOnly: COOKIES.HTTP_ONLY,
    secure: COOKIES.SECURE,
    sameSite: COOKIES.SAME_SITE
};

/**
 * Sign a session JWT for the user and set it as the HTTP-only authToken cookie.
 * The token payload (id, username, role) is defined once, here, for register,
 * login, refresh and change-password.
 * @param {Object} res - Express response
 * @param {{id: number, username: string, role: string}} user
 */
const issueAuthCookie = (res, user) => {
    const token = jwt.sign(
        {id: user.id, username: user.username, role: user.role},
        process.env.JWT_SECRET,
        {expiresIn: AUTH.JWT_EXPIRES_IN}
    );
    res.cookie('authToken', token, {...AUTH_COOKIE_OPTIONS, maxAge: COOKIES.MAX_AGE});
};

/**
 * Whether a token was issued before the account's password last changed.
 * JWT `iat` is whole seconds (floored), so the change time is floored too: a
 * token issued in the same second as the change is not rejected, which keeps
 * the session that just changed its own password working. A NULL
 * password_changed_at (never changed) or a token without `iat` is not revoked.
 * @param {{iat?: number}} decoded - Verified JWT payload
 * @param {Date|string|null|undefined} passwordChangedAt - users.password_changed_at
 * @returns {boolean}
 */
const isTokenRevokedByPasswordChange = (decoded, passwordChangedAt) => {
    if (!passwordChangedAt || typeof decoded?.iat !== 'number') {
        return false;
    }
    const changedAtSeconds = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
    return decoded.iat < changedAtSeconds;
};

/**
 * Timestamp to store in users.password_changed_at. It comes from the
 * APPLICATION clock (the clock that stamps the JWT `iat`), truncated to whole
 * seconds, never from the database's NOW(): with the database host's clock
 * ahead of the app's, NOW() would make the cookie issued by the very request
 * that changed the password look older than the change and reject it.
 * @returns {Date}
 */
const passwordChangeTimestamp = () => new Date(Math.floor(Date.now() / 1000) * 1000);

module.exports = {AUTH_COOKIE_OPTIONS, issueAuthCookie, isTokenRevokedByPasswordChange, passwordChangeTimestamp};
