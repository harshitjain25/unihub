// Lost and found reports. Any logged-in user can create and browse reports;
// only the report's creator (or an administrator) can edit or delete it.
const express = require('express');
const db = require('../lib/db');
const { httpError, sendSuccess } = require('../lib/http');
const { requireText, requireEmail, requireDate, requireChoice, requireId, today } = require('../lib/validate');

const router = express.Router();

const REPORT_TYPES = ['Lost', 'Found'];
const STATUSES = ['Open', 'Resolved'];

function readReportForm(body) {
    const itemDate = requireDate(body.item_date, 'Date lost or found');
    if (itemDate > today()) throw httpError(400, 'Date lost or found cannot be in the future.');
    return [
        requireText(body.item_name, 'Item name', 150),
        requireText(body.category, 'Category', 80),
        requireChoice(body.report_type, REPORT_TYPES, 'Report type'),
        requireText(body.description, 'Description', 5000),
        requireText(body.location, 'Location'),
        itemDate,
        requireEmail(body.contact_email),
        requireChoice(body.status || 'Open', STATUSES, 'Status')
    ];
}

const REPORT_COLUMNS = `
    SELECT r.*, a.username AS reported_by
    FROM lost_found_items r
    JOIN accounts a ON a.user_id = r.user_id`;

// GET /api/lost-found?search=&report_type=&status=&mine=1
router.get('/', async (req, res) => {
    let sql = `${REPORT_COLUMNS} WHERE 1 = 1`;
    const params = [];

    if (req.query.report_type) {
        sql += ' AND r.report_type = ?';
        params.push(requireChoice(req.query.report_type, REPORT_TYPES, 'Report type'));
    }
    if (req.query.status) {
        sql += ' AND r.status = ?';
        params.push(requireChoice(req.query.status, STATUSES, 'Status'));
    }
    if (req.query.mine === '1') {
        sql += ' AND r.user_id = ?';
        params.push(req.user.id);
    }
    if (req.query.search) {
        sql += ' AND (r.item_name LIKE ? OR r.category LIKE ? OR r.location LIKE ?)';
        const pattern = `%${String(req.query.search).slice(0, 100)}%`;
        params.push(pattern, pattern, pattern);
    }

    const [rows] = await db.execute(`${sql} ORDER BY r.created_at DESC, r.id DESC`, params);
    sendSuccess(res, 'Reports loaded.', rows);
});

// GET /api/lost-found/:id
router.get('/:id', async (req, res) => {
    const [rows] = await db.execute(`${REPORT_COLUMNS} WHERE r.id = ?`, [requireId(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Report not found.');
    sendSuccess(res, 'Report loaded.', rows[0]);
});

// POST /api/lost-found — the owner is always the logged-in user
router.post('/', async (req, res) => {
    const [result] = await db.execute(
        `INSERT INTO lost_found_items (item_name, category, report_type, description, location, item_date, contact_email, status, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...readReportForm(req.body), req.user.id]
    );
    sendSuccess(res, 'Report created.', { id: result.insertId }, 201);
});

// Return the report ID if the current user owns it or is an admin; otherwise throw.
async function requireOwnedReport(req) {
    const id = requireId(req.params.id);
    const [rows] = await db.execute('SELECT user_id FROM lost_found_items WHERE id = ?', [id]);
    if (!rows[0]) throw httpError(404, 'Report not found.');
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
        throw httpError(403, 'You can only change your own reports.');
    }
    return id;
}

// PUT /api/lost-found/:id — edit, including marking as Resolved
router.put('/:id', async (req, res) => {
    const id = await requireOwnedReport(req);
    await db.execute(
        `UPDATE lost_found_items
         SET item_name = ?, category = ?, report_type = ?, description = ?, location = ?, item_date = ?, contact_email = ?, status = ?
         WHERE id = ?`,
        [...readReportForm(req.body), id]
    );
    sendSuccess(res, 'Report updated.');
});

// DELETE /api/lost-found/:id
router.delete('/:id', async (req, res) => {
    const id = await requireOwnedReport(req);
    await db.execute('DELETE FROM lost_found_items WHERE id = ?', [id]);
    sendSuccess(res, 'Report deleted.');
});

module.exports = router;
