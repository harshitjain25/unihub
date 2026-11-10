// Authentication and authorization middleware.
const db = require('../lib/db');
const { httpError } = require('../lib/http');

// Allow the request only when someone is logged in.
// The account is re-read from MySQL on every request, so a role change
// (for example promoting a student to admin) takes effect immediately and
// a deleted account cannot keep using an old session.
async function requireLogin(req, res, next) {
    if (!req.session.user) {
        throw httpError(401, 'Please log in to continue.');
    }

    const [rows] = await db.execute(
        'SELECT user_id, username, email, role, created_at FROM accounts WHERE user_id = ?',
        [req.session.user.id]
    );
    const account = rows[0];
    if (!account) {
        req.session.destroy(() => {});
        throw httpError(401, 'Please log in to continue.');
    }

    // req.user is the trusted identity for this request. User IDs or roles
    // sent by the browser are never used.
    req.user = {
        id: account.user_id,
        username: account.username,
        email: account.email,
        role: account.role,
        createdAt: account.created_at
    };
    next();
}

// Allow the request only for administrators. Use after requireLogin.
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        throw httpError(403, 'Administrator access required.');
    }
    next();
}

module.exports = { requireLogin, requireAdmin };
