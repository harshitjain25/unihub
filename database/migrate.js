// One-time upgrade for an existing UniHub database.
// Run with: npm run migrate
//
// What it does (every step checks first, so running it twice is safe):
//   1. Adds role, hash_iterations and updated_at to the `accounts` table
//      created by the login/registration assignment.
//   2. If an older `users` table exists, copies its accounts into `accounts`,
//      points bookings / lost_found_items / volunteer_signups at `accounts`,
//      and renames `users` to `users_retired` (nothing is deleted).
//   3. Adds updated_at columns and the new volunteering statuses.
//
// Take a backup first, for example:
//   /usr/local/mysql/bin/mysqldump -u root -p unihub > unihub-backup.sql
const db = require('../lib/db');

const DATABASE = process.env.DB_NAME || 'unihub';

async function tableExists(table) {
    const [rows] = await db.execute(
        'SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [DATABASE, table]
    );
    return rows.length > 0;
}

async function columnType(table, column) {
    const [rows] = await db.execute(
        'SELECT column_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
        [DATABASE, table, column]
    );
    return rows[0]?.COLUMN_TYPE ?? rows[0]?.column_type ?? null;
}

async function addColumnIfMissing(table, column, definition) {
    if (await columnType(table, column)) return;
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added ${table}.${column}`);
}

// Name of the foreign key on table.column that points at referencedTable, if any.
async function foreignKeyName(table, column, referencedTable) {
    const [rows] = await db.execute(
        `SELECT constraint_name AS name FROM information_schema.key_column_usage
         WHERE table_schema = ? AND table_name = ? AND column_name = ? AND referenced_table_name = ?`,
        [DATABASE, table, column, referencedTable]
    );
    return rows[0]?.name ?? null;
}

async function upgradeAccountsTable() {
    if (!(await tableExists('accounts'))) {
        throw new Error('The accounts table is missing. Run database/schema.sql first.');
    }
    // Existing login-assignment accounts were hashed with 100,000 iterations.
    await addColumnIfMissing('accounts', 'hash_iterations', 'INT UNSIGNED NOT NULL DEFAULT 100000 AFTER salt');
    await addColumnIfMissing('accounts', 'role', "ENUM('student','admin') NOT NULL DEFAULT 'student' AFTER hash_iterations");
    await addColumnIfMissing('accounts', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
}

// Move accounts from the older `users` table into `accounts` and return a map
// of old users.id -> accounts.user_id.
async function copyUsersIntoAccounts() {
    const [users] = await db.query('SELECT id, username, email, password_hash, salt, role FROM users');
    const idMap = new Map();

    for (const user of users) {
        const [existing] = await db.execute(
            'SELECT user_id FROM accounts WHERE username = ? OR email = ?',
            [user.username, user.email]
        );
        if (existing.length) {
            idMap.set(user.id, existing[0].user_id);
            console.log(
                `users.${user.username} matches accounts.user_id ${existing[0].user_id} by username or email; ` +
                'its records now belong to that account (role is not copied).'
            );
            continue;
        }
        // The earlier UniHub version hashed with 210,000 iterations.
        const [result] = await db.execute(
            'INSERT INTO accounts (username, email, password, salt, hash_iterations, role) VALUES (?, ?, ?, ?, 210000, ?)',
            [user.username, user.email, user.password_hash, user.salt, user.role]
        );
        idMap.set(user.id, result.insertId);
        console.log(`Copied users.${user.username} into accounts (user_id ${result.insertId}).`);
    }
    return idMap;
}

// Re-point one table's user_id foreign key from users(id) to accounts(user_id).
async function repointForeignKey(table, constraintName, idMap) {
    const oldKey = await foreignKeyName(table, 'user_id', 'users');
    if (oldKey) {
        await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${oldKey}`);
    }
    // accounts.user_id is a signed INT, so the referencing column must match.
    await db.query(`ALTER TABLE ${table} MODIFY user_id INT NOT NULL`);

    if (idMap.size) {
        const cases = [...idMap].map(([oldId, newId]) => `WHEN ${Number(oldId)} THEN ${Number(newId)}`).join(' ');
        const oldIds = [...idMap.keys()].map(Number).join(',');
        await db.query(`UPDATE ${table} SET user_id = CASE user_id ${cases} END WHERE user_id IN (${oldIds})`);
    }

    if (!(await foreignKeyName(table, 'user_id', 'accounts'))) {
        await db.query(
            `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (user_id) REFERENCES accounts (user_id) ON DELETE RESTRICT`
        );
    }
    console.log(`${table}.user_id now references accounts.user_id`);
}

async function retireUsersTable() {
    if (!(await tableExists('users'))) return;

    const idMap = await copyUsersIntoAccounts();
    await repointForeignKey('bookings', 'fk_bookings_account', idMap);
    await repointForeignKey('lost_found_items', 'fk_lost_found_account', idMap);
    await repointForeignKey('volunteer_signups', 'fk_signups_account', idMap);

    const retiredName = (await tableExists('users_retired')) ? `users_retired_${Date.now()}` : 'users_retired';
    await db.query(`RENAME TABLE users TO ${retiredName}`);
    console.log(`Renamed users to ${retiredName} (kept as a backup; safe to drop later).`);
}

async function upgradeServiceTables() {
    for (const table of ['equipment', 'bookings', 'volunteer_opportunities']) {
        await addColumnIfMissing(table, 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    }

    // Volunteering statuses changed from active/inactive/completed to
    // active/full/completed/cancelled. "inactive" becomes "cancelled".
    const statusType = await columnType('volunteer_opportunities', 'status');
    if (statusType && !statusType.includes("'full'")) {
        await db.query(
            "ALTER TABLE volunteer_opportunities MODIFY status ENUM('active','inactive','full','completed','cancelled') NOT NULL DEFAULT 'active'"
        );
        await db.query("UPDATE volunteer_opportunities SET status = 'cancelled' WHERE status = 'inactive'");
        await db.query(
            "ALTER TABLE volunteer_opportunities MODIFY status ENUM('active','full','completed','cancelled') NOT NULL DEFAULT 'active'"
        );
        console.log('Updated volunteering statuses.');
    }
}

async function main() {
    await upgradeAccountsTable();
    await retireUsersTable();
    await upgradeServiceTables();
    console.log('Migration complete.');
}

main()
    .catch((error) => {
        console.error('Migration failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
