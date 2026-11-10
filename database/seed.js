// Adds sample data so the app has something to show on first run.
// Run with: npm run seed   (after database/schema.sql)
//
// - Only fills tables that are empty, so it never duplicates or overwrites data.
// - Never creates a usable password. Sample lost-and-found reports belong to a
//   "unihub_office" account whose password is random and thrown away, so nobody
//   can log in as it.
// - To get an administrator: register normally, then run
//     UPDATE accounts SET role = 'admin' WHERE username = 'your_username';
const crypto = require('node:crypto');
const db = require('../lib/db');
const { PASSWORD_ITERATIONS, createSalt, hashPassword } = require('../lib/passwords');

const EQUIPMENT = [
    ['Campus laptop', 'Laptop', 'Portable workstation for assignments and presentations.', 8],
    ['DSLR camera kit', 'Camera', 'Camera body, 18–55mm lens, and carrying case for creative projects.', 4],
    ['Presentation projector', 'Projector', 'Portable HDMI projector for student events and club meetings.', 3],
    ['Field audio recorder', 'Audio equipment', 'Capture interviews and sound for coursework.', 5],
    ['Digital multimeter', 'Lab equipment', 'Measure voltage, current, and resistance for lab projects.', 6]
];

const REPORTS = [
    ['Blue water bottle', 'Found', 'Accessories', 'Library, second floor', 'Found near the study desks. Describe the stickers to claim it.'],
    ['Notebook with green cover', 'Lost', 'Stationery', 'Science building', 'Lecture notes for CSC 6000 in a green notebook.'],
    ['Silver key ring', 'Found', 'Keys', 'Student center', 'Three keys found beside the reception desk.']
];

// [title, organization, location, description, days from today, total slots]
const OPPORTUNITIES = [
    ['Campus garden morning', 'Sustainability Club', 'Community garden', 'Help plant and tend our shared garden.', 7, 15],
    ['Food pantry support', 'Student Care Network', 'Student center', 'Sort donations and prepare care packages.', 14, 10],
    ['Neighborhood cleanup', 'Community Engagement Office', 'Main gate', 'Join a team caring for the streets around campus.', 21, 25]
];

async function countRows(table) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
    return row.n;
}

// Find or create the locked account that owns the sample reports.
async function officeAccountId() {
    const [rows] = await db.execute("SELECT user_id FROM accounts WHERE username = 'unihub_office'");
    if (rows[0]) return rows[0].user_id;

    const salt = createSalt();
    const unusablePassword = crypto.randomBytes(32).toString('hex'); // never stored or shown
    const [result] = await db.execute(
        'INSERT INTO accounts (username, email, password, salt, hash_iterations) VALUES (?, ?, ?, ?, ?)',
        ['unihub_office', 'office@unihub.example', await hashPassword(unusablePassword, salt), salt, PASSWORD_ITERATIONS]
    );
    return result.insertId;
}

async function main() {
    if ((await countRows('equipment')) === 0) {
        for (const [name, category, description, total] of EQUIPMENT) {
            await db.execute(
                'INSERT INTO equipment (name, category, description, total_quantity, available_quantity) VALUES (?, ?, ?, ?, ?)',
                [name, category, description, total, total]
            );
        }
        console.log(`Added ${EQUIPMENT.length} equipment items.`);
    } else {
        console.log('Equipment already has data; skipped.');
    }

    if ((await countRows('lost_found_items')) === 0) {
        const ownerId = await officeAccountId();
        for (const [itemName, type, category, location, description] of REPORTS) {
            await db.execute(
                `INSERT INTO lost_found_items (user_id, item_name, category, report_type, description, location, item_date, contact_email)
                 VALUES (?, ?, ?, ?, ?, ?, CURDATE(), 'office@unihub.example')`,
                [ownerId, itemName, category, type, description, location]
            );
        }
        console.log(`Added ${REPORTS.length} lost-and-found reports.`);
    } else {
        console.log('Lost and found already has data; skipped.');
    }

    if ((await countRows('volunteer_opportunities')) === 0) {
        for (const [title, organization, location, description, days, slots] of OPPORTUNITIES) {
            await db.execute(
                `INSERT INTO volunteer_opportunities (title, organization, description, location, event_date, start_time, end_time, total_slots)
                 VALUES (?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? DAY), '09:00', '12:00', ?)`,
                [title, organization, description, location, days, slots]
            );
        }
        console.log(`Added ${OPPORTUNITIES.length} volunteering opportunities.`);
    } else {
        console.log('Volunteering already has data; skipped.');
    }

    console.log('Seeding finished.');
}

main()
    .catch((error) => {
        console.error('Seeding failed:', error.code === 'ER_NO_SUCH_TABLE' ? 'run database/schema.sql first.' : error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
