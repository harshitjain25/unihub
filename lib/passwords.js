// Password hashing with PBKDF2 + SHA-512 (Node.js built-in crypto module).
// This is the same approach as the login/registration assignment.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const pbkdf2 = promisify(crypto.pbkdf2);

// New accounts use 210,000 iterations (OWASP recommendation for PBKDF2-SHA512).
// Accounts created by the earlier login assignment used 100,000; their count is
// stored in accounts.hash_iterations and they are upgraded on their next login.
const PASSWORD_ITERATIONS = 210000;
const KEY_LENGTH = 64; // bytes -> 128 hex characters

// A new random salt for every account (32 bytes -> 64 hex characters).
function createSalt() {
    return crypto.randomBytes(32).toString('hex');
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
    const key = await pbkdf2(password, salt, iterations, KEY_LENGTH, 'sha512');
    return key.toString('hex');
}

// Compare a submitted password with a stored account using a timing-safe comparison.
async function passwordMatches(password, account) {
    const submitted = Buffer.from(await hashPassword(password, account.salt, account.hash_iterations), 'hex');
    const stored = Buffer.from(account.password, 'hex');
    return stored.length === submitted.length && crypto.timingSafeEqual(stored, submitted);
}

module.exports = { PASSWORD_ITERATIONS, createSalt, hashPassword, passwordMatches };
