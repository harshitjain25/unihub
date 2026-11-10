// HTTP tests that do not need any database rows.
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = require('node:crypto').randomBytes(32).toString('hex');
const app = require('../server');

test('public pages, protected pages, API gates, and origin protection', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        for (const page of ['/', '/login.html', '/register.html', '/css/styles.css', '/js/common.js', '/vendor/tabler/css/tabler.min.css', '/vendor/tabler/js/tabler.min.js', '/vendor/tabler-icons/tabler-icons.min.css']) {
            assert.equal((await fetch(base + page)).status, 200, page);
        }

        // Private pages redirect logged-out visitors to the login page, even with tricky spellings.
        for (const page of ['/dashboard.html', '/equipment', '/DASHBOARD.html', '/%64ashboard.html', '/lost-found.html', '/volunteering.html', '/profile', '/profile.html']) {
            const response = await fetch(base + page, { redirect: 'manual' });
            assert.equal(response.status, 302, page);
            assert.equal(response.headers.get('location'), '/login.html', page);
        }

        // Private API endpoints return 401 JSON.
        for (const api of ['/auth/me', '/dashboard', '/equipment', '/bookings/mine', '/lost-found', '/volunteering']) {
            const response = await fetch(`${base}/api${api}`);
            assert.equal(response.status, 401, api);
            assert.equal((await response.json()).success, false);
        }

        assert.equal((await fetch(`${base}/api/missing`)).status, 404);
        assert.equal((await fetch(`${base}/no-such-page`)).status, 404);

        // Requests from another website are rejected.
        const crossSite = await fetch(`${base}/api/auth/login`, {
            method: 'POST',
            headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' },
            body: '{}'
        });
        assert.equal(crossSite.status, 403);

        // Validation happens before the database is touched.
        const badEmail = await fetch(`${base}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'tester', email: 'invalid' })
        });
        assert.equal(badEmail.status, 400);

        const badJson = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
        assert.equal(badJson.status, 400);
    } finally {
        await new Promise((resolve) => server.close(resolve));
        await require('../lib/db').end();
    }
});
