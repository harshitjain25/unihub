# UniHub

**One campus platform for equipment booking, lost and found, and volunteering.**

Final project for my graduate Web Development course at Georgia State University — Harshit Jain.

---

## Motivation

Campus services are scattered across separate websites, email threads, paper forms, and physical noticeboards. A student who needs a camera for a project, has lost their keys, and wants to volunteer has to visit three different places.

UniHub puts these three services behind one login. My personal goal was to build and understand a complete full-stack application on my own: frontend, backend, database design, authentication, sessions, CRUD, testing, and documentation.

## Features

**Accounts**
- Register, log in, log out, and view your profile
- Passwords hashed with PBKDF2-SHA512 and a unique random salt per account
- Session-based login with two roles: **student** and **admin**

**Dashboard**
- Welcome message and role
- Counts of active bookings, open reports, and joined opportunities
- Upcoming bookings, upcoming volunteering events, and recent activity
- Administrator overview (pending bookings, open reports, upcoming events, and more)

**Equipment booking**
- Browse, search, and filter equipment by category, with live availability
- Request a booking for a date range and quantity, then view or cancel it
- Admins create, edit, and delete equipment; approve, reject, or mark bookings returned
- Stock is updated in MySQL transactions, so it can never go negative or be double-booked

**Lost and found**
- Report lost or found items; search by item, category, or location
- Filter by Lost / Found, Open / Resolved, or "only my reports"
- Edit, resolve, or delete your own reports (admins can manage any report)

**Volunteering**
- Browse and search opportunities with remaining slots
- Join, view joined opportunities, and cancel your registration
- Admins create, edit, and delete opportunities and view who registered
- Duplicate signups are blocked by a database constraint; status switches between **Active** and **Full** automatically

## Technology

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no JavaScript framework) |
| UI kit | [Tabler](https://github.com/tabler/tabler) (`@tabler/core`) and [Tabler Icons](https://github.com/tabler/tabler-icons) webfont, both MIT-licensed |
| Backend | Node.js, Express 5 |
| Database | MySQL with `mysql2` (parameterized queries, connection pool) |
| Auth and sessions | Node.js `crypto` (PBKDF2-SHA512), `express-session`, `cookie-parser` |
| Configuration | `dotenv` with `.env` / `.env.example` |
| Testing | Node.js built-in test runner plus an HTTP integration script |

## User roles

| Action | Student | Admin |
|---|:-:|:-:|
| Register, log in, profile, dashboard | ✓ | ✓ |
| Browse equipment and book, view, or cancel own bookings | ✓ | ✓ |
| Create, edit, or delete equipment | | ✓ |
| View all bookings; approve, reject, or mark returned | | ✓ |
| Create lost/found reports; edit, resolve, or delete **own** reports | ✓ | ✓ |
| Edit or delete **any** report | | ✓ |
| Join or leave volunteering opportunities | ✓ | ✓ |
| Create, edit, or delete opportunities; view registrations | | ✓ |

Every admin check is enforced on the server (`middleware/auth.js`). Hiding buttons in the page is only for convenience.

## Folder structure

```
unihub-db-assignment/
├── server.js              Express app: sessions, security headers, routes, error handling
├── routes/
│   ├── auth.js            register, login, logout, me
│   ├── dashboard.js       dashboard summary
│   ├── equipment.js       equipment CRUD
│   ├── bookings.js        bookings and stock updates
│   ├── lostFound.js       lost-and-found CRUD
│   └── volunteering.js    opportunities and signups
├── middleware/auth.js     requireLogin, requireAdmin
├── lib/
│   ├── db.js              MySQL pool and transaction helper
│   ├── passwords.js       PBKDF2 hashing and timing-safe comparison
│   ├── validate.js        server-side validation helpers
│   └── http.js            consistent JSON responses and errors
├── database/
│   ├── schema.sql         creates the unihub database and all tables
│   ├── seed.js            adds sample equipment, reports, and opportunities
│   └── migrate.js         upgrades an older UniHub/login-assignment database
├── public/                pages, css/styles.css (small additions to Tabler), js/*.js
├── test/                  unit, HTTP, and integration tests
├── scripts/check.js       syntax-checks every JavaScript file
├── .env.example
└── package.json
```

## Database design

Six tables in the `unihub` database:

| Table | Purpose | Key relationships |
|---|---|---|
| `accounts` | Users (reused from the login assignment, plus `role`, `hash_iterations`, `updated_at`) | — |
| `equipment` | Items that can be borrowed | — |
| `bookings` | One account borrowing equipment | → `accounts`, → `equipment` (RESTRICT) |
| `lost_found_items` | Lost and found reports | → `accounts` (RESTRICT) |
| `volunteer_opportunities` | Events | — |
| `volunteer_signups` | Who joined what; `UNIQUE (user_id, opportunity_id)` | → `accounts` (RESTRICT), → `volunteer_opportunities` (CASCADE) |

`ON DELETE RESTRICT` protects history: equipment that has bookings cannot be deleted by accident (set it to *inactive* instead). Deleting an opportunity removes its signups.

## Setup

### Prerequisites
- Node.js 20 or newer (developed on v22) and npm
- MySQL Community Server running on port 3306

### Installation

```bash
npm install
cp .env.example .env
```

Edit `.env` and fill in your values. Never commit this file.

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=unihub
SESSION_SECRET=replace_with_a_long_random_secret
PORT=3000
```

`SESSION_SECRET` must be at least 32 random characters. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database

```bash
/usr/local/mysql/bin/mysql -u root -p < database/schema.sql
npm run seed
```

**Already have an older `unihub` database** (from the login assignment or an earlier version of this project)? Back it up, then run the migration once:

```bash
/usr/local/mysql/bin/mysqldump -u root -p unihub > unihub-backup.sql
npm run migrate
```

The migration adds the new columns to `accounts`, moves any accounts from an older `users` table into `accounts`, and renames `users` to `users_retired`. Nothing is deleted, and it is safe to run more than once. Accounts created in the login assignment keep working: their passwords are re-hashed with the stronger settings the first time they log in.

### Start

```bash
npm start
```

Open **http://localhost:3000**. Use `npm run dev` to restart automatically when files change.

### Creating an administrator

No password is ever stored in SQL or seed files. Instead:

1. Register a normal account at http://localhost:3000/register.html.
2. Promote it in MySQL:

   ```sql
   UPDATE unihub.accounts SET role = 'admin' WHERE username = 'chosen_username';
   ```

3. Refresh the page. Roles are re-read from MySQL on every request, so the change applies immediately.

### Demo accounts

There are no shared demo passwords. Register two accounts before the demo, for example `demo_student` and `demo_admin`, then promote `demo_admin` with the SQL above. The seed's sample reports belong to a locked `unihub_office` account whose password is random and never stored, so nobody can log in as it.

## Demo workflow

1. Open http://localhost:3000 and **register** a student account.
2. **Log in**. The dashboard shows your username and role.
3. **Equipment**: search or filter, click **Book** on an item, pick dates, and request it.
4. The **dashboard** now shows one active booking under Upcoming bookings.
5. **Lost & Found**: create a Lost report, then **Edit** it and **Mark resolved**.
6. **Volunteering**: **Join** an opportunity. Remaining slots drop, and it appears on the dashboard.
7. **Log out** (header button, or Profile → Log out). Opening `/dashboard.html` or `/profile` now redirects to login.
8. Log in as the **administrator**. The dashboard shows the Administrator overview.
9. **Equipment**: add or edit an item. Under **All bookings**, **Approve** the student's booking, then **Mark returned**.
10. **Volunteering**: create an opportunity, then click **View registrations** on one the student joined.
11. **Lost & Found**: an admin can edit or delete any report.

## API overview

All responses use the shape `{ "success": true|false, "message": "...", "data": ... }`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create a student account |
| POST | `/api/auth/login` | public | Log in by username or email |
| POST | `/api/auth/logout` | login | End the session |
| GET | `/api/auth/me` | login | Current account |
| GET | `/profile`, `/logout` | page | Kept from the login assignment |
| GET | `/api/dashboard` | login | Counts, upcoming items, recent activity |
| GET | `/api/equipment?search=&category=` | login | List equipment |
| GET | `/api/equipment/:id` | login | One item |
| POST, PUT, DELETE | `/api/equipment[/:id]` | admin | Manage equipment |
| GET | `/api/bookings/mine` | login | Your bookings |
| POST | `/api/bookings` | login | Request a booking |
| DELETE | `/api/bookings/:id` | owner | Cancel your booking |
| GET | `/api/bookings?status=` | admin | All bookings |
| PUT | `/api/bookings/:id/status` | admin | approve / reject / return / cancel |
| GET | `/api/lost-found?search=&report_type=&status=&mine=1` | login | List reports |
| GET | `/api/lost-found/:id` | login | One report |
| POST | `/api/lost-found` | login | Create a report |
| PUT, DELETE | `/api/lost-found/:id` | owner or admin | Edit, resolve, or delete |
| GET | `/api/volunteering?search=&status=` | login | List opportunities |
| GET | `/api/volunteering/mine` | login | Opportunities you joined |
| GET | `/api/volunteering/:id` | login | One opportunity |
| GET | `/api/volunteering/:id/signups` | admin | Registrations |
| POST, PUT, DELETE | `/api/volunteering[/:id]` | admin | Manage opportunities |
| POST, DELETE | `/api/volunteering/:id/signup` | login | Join or leave |

Status codes used: 200, 201, 400 (validation), 401 (not logged in), 403 (not allowed), 404, 409 (duplicate or in use), and 500.

## Testing

```bash
npm run check             # syntax-check every .js file
npm test                  # unit and HTTP tests (no database rows needed)
npm run test:integration  # 45 end-to-end checks against the MySQL database in .env
```

The integration test creates uniquely named `test_…` accounts and records, runs the full workflow for every module, and deletes everything it created, even when a check fails. It covers:

- **Authentication:** registration, duplicate username or email, bad passwords, wrong username or password, profile, logout, profile blocked after logout, and login-assignment account upgrade.
- **Authorization:** logged-out users get 401, students on admin endpoints get 403, and students cannot change other people's records.
- **Equipment:** CRUD, search and filter, invalid dates or quantities, booking, cancelling, approving, rejecting, returning, and consistent availability.
- **Lost and found:** CRUD, search and filters, ownership checks, and resolving.
- **Volunteering:** CRUD, joining, duplicate prevention, full events, cancelling, remaining slots, viewing registrations, and cancelled events.

## Security notes

- Passwords: PBKDF2-SHA512 with 210,000 iterations, a 32-byte random salt per account, and `crypto.timingSafeEqual` for comparison. Hashes and salts are never sent to the browser.
- Every SQL query is parameterized (`?` placeholders).
- Every field is validated on the server, not just in the browser.
- The user ID and role always come from the session and database, never from the request body.
- Session cookies use `httpOnly`, `sameSite: lax`, and `secure` in production, and expire after 2 hours. The session ID is regenerated at login.
- Requests that change data from another website's origin are rejected. A Content-Security-Policy blocks inline scripts, and all user text is HTML-escaped before display.
- Secrets live only in `.env`, which is git-ignored.
- The Tabler CSS, JavaScript, and icon font are installed by `npm install` and served by Express from `node_modules` at `/vendor/...`, so the pages load nothing from outside sites and work offline.

**Known limitations (fine for a class project):**
- Sessions use the default in-memory store, so restarting the server logs everyone out.
- There is no email verification or password reset.
- There are no image uploads for lost-and-found items.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Set SESSION_SECRET in .env…` | Add a random secret of at least 32 characters to `.env`. |
| "Something went wrong on the server" | MySQL isn't running or `.env` credentials are wrong. Check with `/usr/local/mysql/bin/mysql -u root -p`. |
| `ER_NO_SUCH_TABLE` / seeding fails | Run `database/schema.sql` first. |
| Login fails for an old account | Run `npm run migrate` once. |
| Admin buttons are missing | Promote the account with the `UPDATE accounts SET role = 'admin' …` command. |
| `EADDRINUSE :3000` | Another server is running. Stop it or change `PORT` in `.env`. |
| Pages show a blank file | Open the site through `http://localhost:3000`, not `file:///`. |

## Screenshots

Add screenshots to a `screenshots/` folder before submitting, and link them here:

- Home page
- Register and login
- Student dashboard
- Equipment list with a booking
- Admin "All bookings" table
- Lost and found with filters
- Volunteering with remaining slots
- Mobile view

## GitHub submission

Before pushing, confirm that `.env`, `node_modules/`, and `.local-backups/` are **not** staged. They are listed in `.gitignore`.

```bash
git init
git add .
git status
git commit -m "UniHub final project"
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

To make a submission ZIP without dependencies or secrets:

```bash
zip -r unihub-submission.zip . -x "node_modules/*" ".env" ".local-backups/*" ".git/*" "*.DS_Store"
```
