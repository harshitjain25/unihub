// Volunteering opportunities and signups.
//
// remaining_slots = total_slots - number of signups (always calculated, never stored).
// Status: 'active' and 'full' switch automatically as students join or leave;
// administrators can also mark an event 'completed' or 'cancelled'.
const express = require('express');
const db = require('../lib/db');
const { httpError, sendSuccess } = require('../lib/http');
const { requireText, requireInteger, requireId, requireDate, requireTime, requireChoice } = require('../lib/validate');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['active', 'full', 'completed', 'cancelled'];

function readOpportunityForm(body) {
    const startTime = requireTime(body.start_time, 'Start time');
    const endTime = requireTime(body.end_time, 'End time');
    if (startTime >= endTime) throw httpError(400, 'End time must be after the start time.');
    return {
        title: requireText(body.title, 'Title', 150),
        organization: requireText(body.organization, 'Organization', 150),
        description: requireText(body.description, 'Description', 5000),
        location: requireText(body.location, 'Location'),
        eventDate: requireDate(body.event_date, 'Event date'),
        startTime,
        endTime,
        totalSlots: requireInteger(body.total_slots, 'Total slots'),
        status: requireChoice(body.status || 'active', STATUSES, 'Status')
    };
}

// Columns returned for every opportunity, including whether the current user joined it.
const OPPORTUNITY_COLUMNS = `
    SELECT o.*,
           o.total_slots - (SELECT COUNT(*) FROM volunteer_signups s WHERE s.opportunity_id = o.id) AS remaining_slots,
           EXISTS (SELECT 1 FROM volunteer_signups s WHERE s.opportunity_id = o.id AND s.user_id = ?) AS joined,
           TIMESTAMP(o.event_date, o.start_time) <= NOW() AS has_started
    FROM volunteer_opportunities o`;

// Keep 'active' / 'full' in step with the number of signups.
// Completed and cancelled events are left alone.
async function refreshFullStatus(connection, opportunityId) {
    await connection.execute(
        `UPDATE volunteer_opportunities o
         SET o.status = IF((SELECT COUNT(*) FROM volunteer_signups s WHERE s.opportunity_id = o.id) >= o.total_slots, 'full', 'active')
         WHERE o.id = ? AND o.status IN ('active', 'full')`,
        [opportunityId]
    );
}

// GET /api/volunteering?search=&status=
router.get('/', async (req, res) => {
    let sql = `${OPPORTUNITY_COLUMNS} WHERE 1 = 1`;
    const params = [req.user.id];

    if (req.query.status) {
        sql += ' AND o.status = ?';
        params.push(requireChoice(req.query.status, STATUSES, 'Status'));
    }
    if (req.query.search) {
        sql += ' AND (o.title LIKE ? OR o.organization LIKE ? OR o.location LIKE ?)';
        const pattern = `%${String(req.query.search).slice(0, 100)}%`;
        params.push(pattern, pattern, pattern);
    }

    const [rows] = await db.execute(`${sql} ORDER BY o.event_date, o.start_time`, params);
    sendSuccess(res, 'Opportunities loaded.', rows);
});

// GET /api/volunteering/mine — opportunities the current user joined
router.get('/mine', async (req, res) => {
    const [rows] = await db.execute(
        `${OPPORTUNITY_COLUMNS}
         JOIN volunteer_signups mine ON mine.opportunity_id = o.id AND mine.user_id = ?
         ORDER BY o.event_date, o.start_time`,
        [req.user.id, req.user.id]
    );
    sendSuccess(res, 'Your opportunities.', rows);
});

// GET /api/volunteering/:id
router.get('/:id', async (req, res) => {
    const [rows] = await db.execute(`${OPPORTUNITY_COLUMNS} WHERE o.id = ?`, [req.user.id, requireId(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Opportunity not found.');
    sendSuccess(res, 'Opportunity loaded.', rows[0]);
});

// GET /api/volunteering/:id/signups (admin) — who registered
router.get('/:id/signups', requireAdmin, async (req, res) => {
    const [rows] = await db.execute(
        `SELECT s.id, s.created_at, a.user_id, a.username, a.email
         FROM volunteer_signups s JOIN accounts a ON a.user_id = s.user_id
         WHERE s.opportunity_id = ? ORDER BY s.created_at`,
        [requireId(req.params.id)]
    );
    sendSuccess(res, 'Registrations loaded.', rows);
});

// POST /api/volunteering (admin)
router.post('/', requireAdmin, async (req, res) => {
    const o = readOpportunityForm(req.body);
    const status = o.status === 'full' ? 'active' : o.status; // 'full' is set automatically
    const [result] = await db.execute(
        `INSERT INTO volunteer_opportunities (title, organization, description, location, event_date, start_time, end_time, total_slots, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o.title, o.organization, o.description, o.location, o.eventDate, o.startTime, o.endTime, o.totalSlots, status]
    );
    sendSuccess(res, 'Opportunity created.', { id: result.insertId }, 201);
});

// PUT /api/volunteering/:id (admin)
router.put('/:id', requireAdmin, async (req, res) => {
    const id = requireId(req.params.id);
    const o = readOpportunityForm(req.body);

    await db.transaction(async (connection) => {
        const [rows] = await connection.execute('SELECT id FROM volunteer_opportunities WHERE id = ? FOR UPDATE', [id]);
        if (!rows[0]) throw httpError(404, 'Opportunity not found.');

        const [[{ signups }]] = await connection.execute('SELECT COUNT(*) AS signups FROM volunteer_signups WHERE opportunity_id = ?', [id]);
        if (o.totalSlots < signups) {
            throw httpError(400, `Total slots cannot be fewer than the ${signups} student(s) already registered.`);
        }

        await connection.execute(
            `UPDATE volunteer_opportunities
             SET title = ?, organization = ?, description = ?, location = ?, event_date = ?, start_time = ?, end_time = ?, total_slots = ?, status = ?
             WHERE id = ?`,
            [o.title, o.organization, o.description, o.location, o.eventDate, o.startTime, o.endTime, o.totalSlots, o.status, id]
        );
        await refreshFullStatus(connection, id);
    });
    sendSuccess(res, 'Opportunity updated.');
});

// DELETE /api/volunteering/:id (admin) — signups are removed by ON DELETE CASCADE
router.delete('/:id', requireAdmin, async (req, res) => {
    const [result] = await db.execute('DELETE FROM volunteer_opportunities WHERE id = ?', [requireId(req.params.id)]);
    if (!result.affectedRows) throw httpError(404, 'Opportunity not found.');
    sendSuccess(res, 'Opportunity and its registrations deleted.');
});

// POST /api/volunteering/:id/signup — join
router.post('/:id/signup', async (req, res) => {
    const id = requireId(req.params.id);

    await db.transaction(async (connection) => {
        // Lock the opportunity so two students cannot take the last slot together.
        const [rows] = await connection.execute(
            'SELECT *, TIMESTAMP(event_date, start_time) > NOW() AS upcoming FROM volunteer_opportunities WHERE id = ? FOR UPDATE',
            [id]
        );
        const opportunity = rows[0];
        if (!opportunity) throw httpError(404, 'Opportunity not found.');
        if (['completed', 'cancelled'].includes(opportunity.status) || !opportunity.upcoming) {
            throw httpError(400, 'This opportunity is not open for registration.');
        }

        const [already] = await connection.execute(
            'SELECT 1 FROM volunteer_signups WHERE opportunity_id = ? AND user_id = ?',
            [id, req.user.id]
        );
        if (already.length) throw httpError(409, 'You have already joined this opportunity.');

        const [[{ signups }]] = await connection.execute('SELECT COUNT(*) AS signups FROM volunteer_signups WHERE opportunity_id = ?', [id]);
        if (signups >= opportunity.total_slots) throw httpError(400, 'All slots are filled.');

        await connection.execute('INSERT INTO volunteer_signups (user_id, opportunity_id) VALUES (?, ?)', [req.user.id, id]);
        await refreshFullStatus(connection, id);
    });
    sendSuccess(res, 'You joined the opportunity.', undefined, 201);
});

// DELETE /api/volunteering/:id/signup — leave (only your own registration)
router.delete('/:id/signup', async (req, res) => {
    const id = requireId(req.params.id);

    await db.transaction(async (connection) => {
        await connection.execute('SELECT id FROM volunteer_opportunities WHERE id = ? FOR UPDATE', [id]);
        const [result] = await connection.execute(
            'DELETE FROM volunteer_signups WHERE user_id = ? AND opportunity_id = ?',
            [req.user.id, id]
        );
        if (!result.affectedRows) throw httpError(404, 'You are not registered for this opportunity.');
        await refreshFullStatus(connection, id);
    });
    sendSuccess(res, 'Your registration was cancelled.');
});

module.exports = router;
