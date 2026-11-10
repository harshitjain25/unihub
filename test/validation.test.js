// Unit tests for validation, password hashing, and the auth middleware.
// Run with: npm test   (no database needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireDate, requireInteger, requireEmail, requireChoice, requireTime, requireText } = require('../lib/validate');
const { createSalt, hashPassword, passwordMatches } = require('../lib/passwords');
const { requireLogin, requireAdmin } = require('../middleware/auth');

test('dates must be real calendar dates', () => {
    assert.equal(requireDate('2028-02-29'), '2028-02-29');
    for (const value of ['2027-02-29', '2026-04-31', 'today', null, '2026-1-5']) {
        assert.throws(() => requireDate(value));
    }
});

test('quantities, emails, choices, times, and text are validated', () => {
    for (const value of [0, -1, 1.5, 'abc', Infinity, '', null, true, [3]]) {
        assert.throws(() => requireInteger(value, 'Quantity'));
    }
    assert.equal(requireInteger('3', 'Quantity'), 3);
    assert.equal(requireEmail(' A@B.edu '), 'a@b.edu');
    assert.throws(() => requireEmail('broken'));
    assert.throws(() => requireChoice('admin', ['student'], 'Role'));
    assert.equal(requireTime('09:30', 'Start'), '09:30:00');
    assert.throws(() => requireTime('25:00', 'Start'));
    assert.equal(requireText('  hi  ', 'Name'), 'hi');
    assert.throws(() => requireText('   ', 'Name'));
    assert.throws(() => requireText('x'.repeat(11), 'Name', 10));
});

test('PBKDF2 hashes are salted, repeatable, and checked safely', async () => {
    const salt = createSalt();
    const hash = await hashPassword('a-test-password', salt);
    assert.equal(hash.length, 128);
    assert.equal(hash, await hashPassword('a-test-password', salt));
    assert.notEqual(hash, await hashPassword('a-test-password', createSalt()));

    const account = { password: hash, salt, hash_iterations: 210000 };
    assert.equal(await passwordMatches('a-test-password', account), true);
    assert.equal(await passwordMatches('wrong-password', account), false);
});

test('login and admin middleware reject unauthorized requests', async () => {
    await assert.rejects(() => requireLogin({ session: {} }, {}, () => {}), { status: 401 });
    assert.throws(() => requireAdmin({ user: { role: 'student' } }, {}, () => {}), { status: 403 });
    let passed = false;
    requireAdmin({ user: { role: 'admin' } }, {}, () => (passed = true));
    assert.equal(passed, true);
});
