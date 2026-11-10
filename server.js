// UniHub — Express server
// Serves the HTML/CSS/JS pages in /public and the JSON API under /api.
require('dotenv').config({ quiet: true });
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { httpError } = require('./lib/http');
const { requireLogin } = require('./middleware/auth');
const auth = require('./routes/auth');

// Refuse to start with a missing or placeholder session secret.
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32 || secret === 'replace_with_a_long_random_secret') {
    throw new Error('Set SESSION_SECRET in .env to a random value of at least 32 characters.');
}

const app = express();
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Request parsing, cookies, and sessions
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(
    session({
        name: 'unihub.sid',
        secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true, // JavaScript in the page cannot read the cookie
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production', // false on http://localhost
            maxAge: 2 * 60 * 60 * 1000 // 2 hours
        }
    })
);

// ---------------------------------------------------------------------------
// Basic security headers, and reject state-changing requests from other sites
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    if (req.path.startsWith('/api')) {
        res.setHeader('Cache-Control', 'no-store');
    }

    const changesData = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const origin = req.headers.origin;
    if (changesData && origin && origin !== `${req.protocol}://${req.get('host')}`) {
        return next(httpError(403, 'Cross-origin request rejected.'));
    }
    next();
});

// ---------------------------------------------------------------------------
// JSON API
// ---------------------------------------------------------------------------
app.use('/api/auth', auth.router);
app.use('/api/dashboard', requireLogin, require('./routes/dashboard'));
app.use('/api/equipment', requireLogin, require('./routes/equipment'));
app.use('/api/bookings', requireLogin, require('./routes/bookings'));
app.use('/api/lost-found', requireLogin, require('./routes/lostFound'));
app.use('/api/volunteering', requireLogin, require('./routes/volunteering'));
app.use('/api', (req, res, next) => next(httpError(404, 'API route not found.')));

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROTECTED_PAGES = ['/dashboard', '/equipment', '/lost-found', '/volunteering', '/profile'];

// Logged-out visitors who open a private page are sent to the login page.
// The path is normalized so tricks like /DASHBOARD.html or /%64ashboard still match.
app.use((req, res, next) => {
    let page;
    try {
        page = path.posix.normalize(decodeURIComponent(req.path)).toLowerCase().replace(/\/$/, '').replace(/\.html$/, '');
    } catch {
        return res.status(400).send('Bad request.');
    }
    if (PROTECTED_PAGES.includes(page) && !req.session.user) {
        return res.redirect('/login.html');
    }
    next();
});

// GET /profile — kept from the login assignment; shows the session's account.
app.get('/profile', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'profile.html')));

// GET /logout — kept from the login assignment; ends the session and returns to login.
app.get('/logout', async (req, res) => {
    await auth.endSession(req, res);
    res.redirect('/login.html?loggedOut=1');
});

// Tabler UI kit (CSS, JS, and icon font) served from node_modules, so it works offline.
app.use('/vendor/tabler', express.static(path.join(__dirname, 'node_modules/@tabler/core/dist')));
app.use('/vendor/tabler-icons', express.static(path.join(__dirname, 'node_modules/@tabler/icons-webfont/dist')));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

// ---------------------------------------------------------------------------
// Central error handler: every error becomes { success: false, message }
// ---------------------------------------------------------------------------
app.use((error, req, res, next) => {
    let status = error.status || 500;
    let message = error.message;

    if (error.code === 'ER_DUP_ENTRY') {
        status = 409;
        message = 'That record already exists.';
    } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        status = 409;
        message = 'This record has booking history, so it cannot be deleted. Set it to inactive instead.';
    } else if (error.type === 'entity.parse.failed') {
        status = 400;
        message = 'The request body is not valid JSON.';
    } else if (status >= 500) {
        console.error('Request failed:', error.code || error.name, error.message);
        message = 'Something went wrong on the server. Check that MySQL is running and .env is correct.';
    }

    res.status(status).json({ success: false, message });
});

// Start listening only when run directly (tests import the app without starting it).
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const server = app.listen(port, () => console.log(`UniHub is running at http://localhost:${port}`));
    process.on('SIGTERM', () => server.close(() => require('./lib/db').end()));
}

module.exports = app;
