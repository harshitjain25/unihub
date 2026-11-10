// Full end-to-end test against the real MySQL database in .env.
// Run with: npm run test:integration
//
// It creates uniquely named test accounts and records (prefix "test_<random>"),
// exercises every module through the HTTP API, and deletes everything it
// created at the end — even if a check fails.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../lib/db');
const { createSalt, hashPassword } = require('../lib/passwords');

const tag = `test_${crypto.randomBytes(4).toString('hex')}`;
const password = crypto.randomBytes(12).toString('hex');
const created = { accounts: [], equipment: [], reports: [], opportunities: [] };
let server;
let base;
let passed = 0;

// Each "client" keeps its own session cookie, like a separate browser.
function newClient() {
    return { cookie: null };
}

async function request(client, path, { method = 'GET', body, expect = 200, raw = false } = {}) {
    const response = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', ...(client.cookie ? { Cookie: client.cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) client.cookie = setCookie.split(';')[0];

    if (raw) {
        assert.equal(response.status, expect, `${method} ${path}`);
        return response;
    }
    const result = await response.json();
    assert.equal(response.status, expect, `${method} ${path} → ${response.status}: ${result.message}`);
    assert.equal(result.success, expect < 400);
    return result.data;
}

const api = (client, path, options) => request(client, `/api${path}`, options);

function check(description) {
    passed += 1;
    console.log(`  ✓ ${description}`);
}

async function createAccountDirectly(username, role, iterations = 210000) {
    const salt = createSalt();
    const [result] = await db.execute(
        'INSERT INTO accounts (username, email, password, salt, hash_iterations, role) VALUES (?, ?, ?, ?, ?, ?)',
        [username, `${username}@example.edu`, await hashPassword(password, salt, iterations), salt, iterations, role]
    );
    created.accounts.push(result.insertId);
    return result.insertId;
}

async function testAuthentication(student, other) {
    console.log('Authentication');
    const register = (client, username, extra = {}) =>
        api(client, '/auth/register', {
            method: 'POST',
            body: { username, email: `${username}@example.edu`, password, confirmPassword: password, ...extra },
            expect: extra.expect || 201
        });

    // A role sent by the browser must be ignored.
    await register(student, `${tag}_s`, { role: 'admin' });
    await register(other, `${tag}_o`);
    for (const username of [`${tag}_s`, `${tag}_o`]) {
        const [[row]] = await db.execute('SELECT user_id, role, password FROM accounts WHERE username = ?', [username]);
        created.accounts.push(row.user_id);
        assert.equal(row.role, 'student');
        assert.notEqual(row.password, password);
    }
    check('valid registration stores a hashed password and the student role');

    await api(student, '/auth/register', { method: 'POST', body: { username: `${tag}_s`, email: `${tag}_new@example.edu`, password, confirmPassword: password }, expect: 409 });
    check('duplicate username is rejected (409)');
    await api(student, '/auth/register', { method: 'POST', body: { username: `${tag}_x`, email: `${tag}_s@example.edu`, password, confirmPassword: password }, expect: 409 });
    check('duplicate email is rejected (409)');
    await api(student, '/auth/register', { method: 'POST', body: { username: `${tag}_y`, email: `${tag}_y@example.edu`, password: 'short', confirmPassword: 'short' }, expect: 400 });
    await api(student, '/auth/register', { method: 'POST', body: { username: `${tag}_y`, email: `${tag}_y@example.edu`, password, confirmPassword: `${password}x` }, expect: 400 });
    check('short or mismatched passwords are rejected (400)');

    await api(student, '/auth/login', { method: 'POST', body: { identifier: `${tag}_nobody`, password }, expect: 401 });
    check('unknown username is rejected (401)');
    await api(student, '/auth/login', { method: 'POST', body: { identifier: `${tag}_s`, password: 'incorrect-password' }, expect: 401 });
    check('incorrect password is rejected (401)');

    const user = await api(student, '/auth/login', { method: 'POST', body: { identifier: `${tag}_s`, password } });
    assert.equal(user.username, `${tag}_s`);
    assert.equal(user.password, undefined);
    assert.equal(user.salt, undefined);
    await api(other, '/auth/login', { method: 'POST', body: { identifier: `${tag}_o@example.edu`, password } });
    check('valid login by username or email; no hash or salt returned');

    const me = await api(student, '/auth/me');
    assert.equal(me.username, `${tag}_s`);
    await request(student, '/profile', { raw: true, expect: 200 });
    check('session profile works (/api/auth/me and /profile)');

    // Logout via the GET /logout route kept from the login assignment.
    const temp = newClient();
    await api(temp, '/auth/login', { method: 'POST', body: { identifier: `${tag}_o`, password } });
    const logout = await request(temp, '/logout', { raw: true, expect: 302 });
    assert.equal(logout.headers.get('location'), '/login.html?loggedOut=1');
    await api(temp, '/auth/me', { expect: 401 });
    const blocked = await request(temp, '/profile', { raw: true, expect: 302 });
    assert.equal(blocked.headers.get('location'), '/login.html');
    check('logout destroys the session and /profile is blocked afterwards');

    // An account created by the earlier login assignment (100,000 iterations).
    const legacyId = await createAccountDirectly(`${tag}_legacy`, 'student', 100000);
    await api(newClient(), '/auth/login', { method: 'POST', body: { identifier: `${tag}_legacy`, password } });
    const [[legacy]] = await db.execute('SELECT hash_iterations FROM accounts WHERE user_id = ?', [legacyId]);
    assert.equal(legacy.hash_iterations, 210000);
    check('login-assignment accounts still log in and are upgraded to 210,000 iterations');
}

async function testAuthorization(student, admin) {
    console.log('Authorization');
    const anonymous = newClient();
    for (const path of ['/dashboard', '/equipment', '/bookings/mine', '/lost-found', '/volunteering']) {
        await api(anonymous, path, { expect: 401 });
    }
    check('unauthenticated requests to private endpoints are blocked (401)');

    await api(student, '/equipment', { method: 'POST', body: {}, expect: 403 });
    await api(student, '/bookings', { expect: 403 });
    await api(student, '/volunteering', { method: 'POST', body: {}, expect: 403 });
    check('students are blocked from administrator endpoints (403)');

    const adminDashboard = await api(admin, '/dashboard');
    assert.ok(adminDashboard.admin);
    const studentDashboard = await api(student, '/dashboard');
    assert.equal(studentDashboard.admin, undefined);
    check('administrators get management data; students do not');
}

async function testEquipmentAndBookings(student, other, admin) {
    console.log('Equipment and bookings');
    const equipment = { name: `${tag} laptop`, category: 'Laptop', description: 'Integration test equipment', total_quantity: 3, status: 'active' };
    const { id } = await api(admin, '/equipment', { method: 'POST', body: equipment, expect: 201 });
    created.equipment.push(id);
    check('administrator creates equipment');

    assert.equal((await api(student, `/equipment/${id}`)).available_quantity, 3);
    assert.ok((await api(student, `/equipment?search=${tag}`)).some((row) => row.id === id));
    assert.ok((await api(student, '/equipment?category=Laptop')).some((row) => row.id === id));
    assert.ok(!(await api(student, '/equipment?category=Camera')).some((row) => row.id === id));
    check('students read, search, and filter equipment by category');

    await api(admin, `/equipment/${id}`, { method: 'PUT', body: { ...equipment, name: `${tag} laptop (edited)` } });
    await api(admin, `/equipment/${id}`, { method: 'PUT', body: { ...equipment, category: 'Spaceship' }, expect: 400 });
    check('administrator updates equipment; invalid category rejected');

    const booking = { equipment_id: id, start_date: '2099-01-01', end_date: '2099-01-03', quantity: 2 };
    await api(student, '/bookings', { method: 'POST', body: { ...booking, quantity: 0 }, expect: 400 });
    await api(student, '/bookings', { method: 'POST', body: { ...booking, quantity: 4 }, expect: 400 });
    check('invalid quantity (zero or more than available) is rejected');
    await api(student, '/bookings', { method: 'POST', body: { ...booking, end_date: '2098-12-31' }, expect: 400 });
    await api(student, '/bookings', { method: 'POST', body: { ...booking, start_date: '2020-01-01' }, expect: 400 });
    check('invalid date range and past start date are rejected');

    const first = await api(student, '/bookings', { method: 'POST', body: booking, expect: 201 });
    const available = async () => (await api(student, `/equipment/${id}`)).available_quantity;
    assert.equal(await available(), 1);
    assert.ok((await api(student, '/bookings/mine')).some((row) => row.id === first.id && row.status === 'pending'));
    check('booking created; availability drops from 3 to 1');

    await api(other, '/bookings', { method: 'POST', body: booking, expect: 400 });
    await api(other, `/bookings/${first.id}`, { method: 'DELETE', expect: 403 });
    check("another student cannot overbook or cancel someone else's booking");

    await api(admin, `/equipment/${id}`, { method: 'PUT', body: { ...equipment, total_quantity: 1 }, expect: 400 });
    check('total quantity cannot go below what is booked');

    await api(admin, `/bookings/${first.id}/status`, { method: 'PUT', body: { status: 'approved' } });
    await api(admin, `/bookings/${first.id}/status`, { method: 'PUT', body: { status: 'approved' }, expect: 400 });
    await api(admin, `/bookings/${first.id}/status`, { method: 'PUT', body: { status: 'returned' } });
    assert.equal(await available(), 3);
    await api(admin, `/bookings/${first.id}/status`, { method: 'PUT', body: { status: 'approved' }, expect: 400 });
    check('admin approves then marks returned; stock restored; finished bookings cannot reopen');

    const second = await api(other, '/bookings', { method: 'POST', body: { ...booking, quantity: 1 }, expect: 201 });
    await api(admin, `/bookings/${second.id}/status`, { method: 'PUT', body: { status: 'rejected' } });
    assert.equal(await available(), 3);
    check('admin rejection returns stock');

    const third = await api(student, '/bookings', { method: 'POST', body: { ...booking, quantity: 3 }, expect: 201 });
    assert.equal(await available(), 0);
    await api(student, `/bookings/${third.id}`, { method: 'DELETE' });
    await api(student, `/bookings/${third.id}`, { method: 'DELETE', expect: 400 });
    assert.equal(await available(), 3);
    check('student cancels own booking; stock restored; double cancel rejected');

    const counts = (await api(student, '/dashboard')).counts;
    assert.equal(counts.activeBookings, 0);
    check('availability is consistent and the dashboard count matches');

    await api(admin, `/equipment/${id}`, { method: 'DELETE', expect: 409 });
    check('equipment with booking history cannot be deleted (409)');

    const spare = await api(admin, '/equipment', { method: 'POST', body: { ...equipment, name: `${tag} spare` }, expect: 201 });
    created.equipment.push(spare.id);
    await api(admin, `/equipment/${spare.id}`, { method: 'DELETE' });
    await api(student, `/equipment/${spare.id}`, { expect: 404 });
    check('administrator deletes equipment without history');
}

async function testLostAndFound(student, other, admin) {
    console.log('Lost and found');
    const report = {
        item_name: `${tag} keys`, category: 'Keys', report_type: 'Lost', description: 'Integration test report',
        location: 'Library', item_date: '2026-01-01', contact_email: `${tag}@example.edu`, status: 'Open'
    };
    const { id } = await api(student, '/lost-found', { method: 'POST', body: report, expect: 201 });
    created.reports.push(id);
    check('student creates a report');

    assert.ok((await api(other, '/lost-found')).some((row) => row.id === id));
    assert.ok((await api(other, `/lost-found?search=${tag}`)).some((row) => row.id === id));
    assert.ok((await api(other, `/lost-found?report_type=Lost&status=Open&search=${tag}`)).some((row) => row.id === id));
    assert.ok(!(await api(other, `/lost-found?report_type=Found&search=${tag}`)).some((row) => row.id === id));
    assert.ok((await api(student, '/lost-found?mine=1')).every((row) => row.user_id === created.accounts[0]));
    check('reports are listed, searched, and filtered');

    await api(other, `/lost-found/${id}`, { method: 'PUT', body: report, expect: 403 });
    await api(other, `/lost-found/${id}`, { method: 'DELETE', expect: 403 });
    check("another student cannot edit or delete someone else's report (403)");

    await api(student, `/lost-found/${id}`, { method: 'PUT', body: { ...report, description: 'Edited by owner' } });
    await api(student, `/lost-found/${id}`, { method: 'PUT', body: { ...report, status: 'Resolved' } });
    assert.equal((await api(student, `/lost-found/${id}`)).status, 'Resolved');
    assert.ok((await api(student, `/lost-found?status=Resolved&search=${tag}`)).some((row) => row.id === id));
    check('owner edits the report and marks it resolved');

    await api(admin, `/lost-found/${id}`, { method: 'PUT', body: report });
    check('administrator can manage any report');

    await api(student, `/lost-found/${id}`, { method: 'DELETE' });
    await api(student, `/lost-found/${id}`, { expect: 404 });
    check('owner deletes the report');
}

async function testVolunteering(student, other, admin) {
    console.log('Volunteering');
    const opportunity = {
        title: `${tag} cleanup`, organization: 'Campus', description: 'Integration test event', location: 'Main gate',
        event_date: '2099-01-01', start_time: '09:00', end_time: '12:00', total_slots: 1, status: 'active'
    };
    const { id } = await api(admin, '/volunteering', { method: 'POST', body: opportunity, expect: 201 });
    created.opportunities.push(id);
    check('administrator creates an opportunity');

    await api(admin, `/volunteering/${id}`, { method: 'PUT', body: { ...opportunity, description: 'Edited' } });
    await api(admin, `/volunteering/${id}`, { method: 'PUT', body: { ...opportunity, end_time: '08:00' }, expect: 400 });
    check('administrator edits an opportunity; end time must follow start time');

    await api(student, `/volunteering/${id}/signup`, { method: 'POST', expect: 201 });
    let event = await api(student, `/volunteering/${id}`);
    assert.equal(event.remaining_slots, 0);
    assert.equal(event.status, 'full');
    assert.equal(Number(event.joined), 1);
    check('student joins; remaining slots 0 and status becomes full');

    await api(student, `/volunteering/${id}/signup`, { method: 'POST', expect: 409 });
    check('duplicate signup is prevented (409)');
    await api(other, `/volunteering/${id}/signup`, { method: 'POST', expect: 400 });
    check('signup is prevented when the opportunity is full');

    const signups = await api(admin, `/volunteering/${id}/signups`);
    assert.deepEqual(signups.map((row) => row.username), [`${tag}_s`]);
    await api(student, `/volunteering/${id}/signups`, { expect: 403 });
    check('administrator views registrations; students cannot');

    assert.ok((await api(student, '/volunteering/mine')).some((row) => row.id === id));
    assert.equal((await api(student, '/dashboard')).upcomingEvents.some((row) => row.id === id), true);
    check('joined opportunity appears in "mine" and on the dashboard');

    await api(other, `/volunteering/${id}/signup`, { method: 'DELETE', expect: 404 });
    check("a student cannot cancel someone else's registration");

    await api(student, `/volunteering/${id}/signup`, { method: 'DELETE' });
    event = await api(student, `/volunteering/${id}`);
    assert.equal(event.remaining_slots, 1);
    assert.equal(event.status, 'active');
    check('student cancels; slot returns and status goes back to active');

    await api(admin, `/volunteering/${id}`, { method: 'PUT', body: { ...opportunity, status: 'cancelled' } });
    await api(other, `/volunteering/${id}/signup`, { method: 'POST', expect: 400 });
    check('signup is prevented for cancelled opportunities');

    await api(admin, `/volunteering/${id}`, { method: 'DELETE' });
    await api(admin, `/volunteering/${id}`, { expect: 404 });
    check('administrator deletes an opportunity');
}

async function main() {
    if (!process.env.DB_PASSWORD) throw new Error('Configure .env and import database/schema.sql before integration testing.');
    await db.execute('SELECT 1');

    server = require('../server').listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    const student = newClient();
    const other = newClient();
    const admin = newClient();

    await testAuthentication(student, other);
    await createAccountDirectly(`${tag}_admin`, 'admin');
    await api(admin, '/auth/login', { method: 'POST', body: { identifier: `${tag}_admin`, password } });

    await testAuthorization(student, admin);
    await testEquipmentAndBookings(student, other, admin);
    await testLostAndFound(student, other, admin);
    await testVolunteering(student, other, admin);

    await api(student, '/auth/logout', { method: 'POST' });
    await api(student, '/auth/me', { expect: 401 });
    check('POST /api/auth/logout ends the session');

    console.log(`\nAll ${passed} integration checks passed.`);
}

// Remove every record this test created, children before parents.
async function cleanup() {
    for (const id of created.reports) await db.execute('DELETE FROM lost_found_items WHERE id = ?', [id]);
    for (const id of created.opportunities) await db.execute('DELETE FROM volunteer_opportunities WHERE id = ?', [id]);
    for (const id of created.equipment) {
        await db.execute('DELETE FROM bookings WHERE equipment_id = ?', [id]);
        await db.execute('DELETE FROM equipment WHERE id = ?', [id]);
    }
    for (const id of created.accounts) {
        await db.execute('DELETE FROM volunteer_signups WHERE user_id = ?', [id]);
        await db.execute('DELETE FROM bookings WHERE user_id = ?', [id]);
        await db.execute('DELETE FROM lost_found_items WHERE user_id = ?', [id]);
        await db.execute('DELETE FROM accounts WHERE user_id = ?', [id]);
    }
}

main()
    .catch((error) => {
        console.error(`\n✗ ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await cleanup();
        } catch (error) {
            console.error(`Cleanup failed (${error.message}); look for records starting with ${tag}.`);
            process.exitCode = 1;
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        await db.end();
    });
