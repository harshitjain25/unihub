// Registration, login, logout, and "who am I" endpoints.
// Adapted from the login/registration assignment: same PBKDF2-SHA512 hashing,
// random salt per account, parameterized queries, and session-based login.
const express = require('express');
const db = require('../lib/db');
const { httpError, sendSuccess } = require('../lib/http');
const { requireText, requireEmail } = require('../lib/validate');
const { PASSWORD_ITERATIONS, createSalt, hashPassword, passwordMatches } = require('../lib/passwords');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// Used when a username does not exist, so a failed login takes the same time
// whether or not the account exists.
const DUMMY_ACCOUNT = { password: '00'.repeat(64), salt: '0'.repeat(64), hash_iterations: PASSWORD_ITERATIONS };

function requirePassword(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 256) {
        throw httpError(400, 'Password must be between 8 and 256 characters.');
    }
    return value;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const username = requireText(req.body.username, 'Username', 50);
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
        throw httpError(400, 'Username must be 3–50 letters, numbers, dots, dashes, or underscores.');
    }
    const email = requireEmail(req.body.email);
    const password = requirePassword(req.body.password);
    if (password !== req.body.confirmPassword) {
        throw httpError(400, 'Passwords do not match.');
    }

    // Give a specific message for duplicates. (The UNIQUE constraints in MySQL
    // still protect against two requests arriving at the same moment.)
    const [taken] = await db.execute('SELECT username, email FROM accounts WHERE username = ? OR email = ?', [username, email]);
    if (taken.some((row) => row.username.toLowerCase() === username.toLowerCase())) {
        throw httpError(409, 'That username is already taken.');
    }
    if (taken.length) {
        throw httpError(409, 'An account with that email already exists.');
    }

    // The role column defaults to 'student'; a role sent by the browser is ignored.
    const salt = createSalt();
    const passwordHash = await hashPassword(password, salt);
    await db.execute(
        'INSERT INTO accounts (username, email, password, salt, hash_iterations) VALUES (?, ?, ?, ?, ?)',
        [username, email, passwordHash, salt, PASSWORD_ITERATIONS]
    );

    sendSuccess(res, 'You have successfully registered. You can now log in.', undefined, 201);
});

// POST /api/auth/login  (identifier = username or email)
router.post('/login', async (req, res) => {
    const identifier = requireText(req.body.identifier, 'Username or email');
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const [rows] = await db.execute('SELECT * FROM accounts WHERE username = ? OR email = ?', [identifier, identifier.toLowerCase()]);
    const account = rows[0];
    const valid = await passwordMatches(password, account || DUMMY_ACCOUNT);
    if (!account || !valid || password.length > 256) {
        throw httpError(401, 'The login credentials were incorrect.');
    }

    // Accounts from the earlier login assignment used fewer iterations:
    // re-hash them with the current settings now that we know the password.
    if (account.hash_iterations < PASSWORD_ITERATIONS) {
        const salt = createSalt();
        await db.execute(
            'UPDATE accounts SET password = ?, salt = ?, hash_iterations = ? WHERE user_id = ?',
            [await hashPassword(password, salt), salt, PASSWORD_ITERATIONS, account.user_id]
        );
    }

    // Start a fresh session (prevents session fixation), then store who logged in.
    await new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
    req.session.user = { id: account.user_id, username: account.username, email: account.email, role: account.role };

    sendSuccess(res, `You have logged in successfully, ${account.username}.`, req.session.user);
});

// GET /api/auth/me — the logged-in account (never includes the hash or salt)
router.get('/me', requireLogin, (req, res) => {
    sendSuccess(res, 'Current account.', req.user);
});

// Destroy the session and remove the cookie. Shared by POST /api/auth/logout and GET /logout.
function endSession(req, res) {
    return new Promise((resolve, reject) => {
        req.session.destroy((error) => {
            if (error) return reject(error);
            res.clearCookie('unihub.sid');
            resolve();
        });
    });
}

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    await endSession(req, res);
    sendSuccess(res, 'You have logged out.');
});

module.exports = { router, endSession };
