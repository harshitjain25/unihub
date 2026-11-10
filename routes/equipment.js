// Equipment catalogue. Everyone logged in can browse; only admins can change it.
const express = require('express');
const db = require('../lib/db');
const { httpError, sendSuccess } = require('../lib/http');
const { requireText, requireInteger, requireId, requireChoice } = require('../lib/validate');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['Laptop', 'Camera', 'Projector', 'Audio equipment', 'Lab equipment', 'Other'];
const STATUSES = ['active', 'inactive'];

// Validate the fields an administrator submits when creating or editing equipment.
function readEquipmentForm(body) {
    return {
        name: requireText(body.name, 'Name', 150),
        category: requireChoice(body.category, CATEGORIES, 'Category'),
        description: requireText(body.description, 'Description', 5000),
        totalQuantity: requireInteger(body.total_quantity, 'Total quantity'),
        status: requireChoice(body.status, STATUSES, 'Status')
    };
}

// GET /api/equipment?search=&category=
router.get('/', async (req, res) => {
    let sql = 'SELECT * FROM equipment WHERE 1 = 1';
    const params = [];

    if (req.query.category) {
        sql += ' AND category = ?';
        params.push(requireChoice(req.query.category, CATEGORIES, 'Category'));
    }
    if (req.query.search) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const pattern = `%${String(req.query.search).slice(0, 100)}%`;
        params.push(pattern, pattern);
    }

    const [rows] = await db.execute(`${sql} ORDER BY name`, params);
    sendSuccess(res, 'Equipment loaded.', rows);
});

// GET /api/equipment/:id
router.get('/:id', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM equipment WHERE id = ?', [requireId(req.params.id)]);
    if (!rows[0]) throw httpError(404, 'Equipment not found.');
    sendSuccess(res, 'Equipment loaded.', rows[0]);
});

// POST /api/equipment (admin)
router.post('/', requireAdmin, async (req, res) => {
    const item = readEquipmentForm(req.body);
    const [result] = await db.execute(
        `INSERT INTO equipment (name, category, description, total_quantity, available_quantity, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.name, item.category, item.description, item.totalQuantity, item.totalQuantity, item.status]
    );
    sendSuccess(res, 'Equipment created.', { id: result.insertId }, 201);
});

// PUT /api/equipment/:id (admin)
// Units currently held by pending/approved bookings stay reserved, so the new
// total cannot be lower than what is already booked.
router.put('/:id', requireAdmin, async (req, res) => {
    const id = requireId(req.params.id);
    const item = readEquipmentForm(req.body);

    await db.transaction(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM equipment WHERE id = ? FOR UPDATE', [id]);
        const current = rows[0];
        if (!current) throw httpError(404, 'Equipment not found.');

        const reserved = current.total_quantity - current.available_quantity;
        if (item.totalQuantity < reserved) {
            throw httpError(400, `Total quantity cannot be less than the ${reserved} unit(s) currently booked.`);
        }

        await connection.execute(
            `UPDATE equipment SET name = ?, category = ?, description = ?, total_quantity = ?, available_quantity = ?, status = ?
             WHERE id = ?`,
            [item.name, item.category, item.description, item.totalQuantity, item.totalQuantity - reserved, item.status, id]
        );
    });
    sendSuccess(res, 'Equipment updated.');
});

// DELETE /api/equipment/:id (admin)
// MySQL refuses (409) if the item has booking history; set it inactive instead.
router.delete('/:id', requireAdmin, async (req, res) => {
    const [result] = await db.execute('DELETE FROM equipment WHERE id = ?', [requireId(req.params.id)]);
    if (!result.affectedRows) throw httpError(404, 'Equipment not found.');
    sendSuccess(res, 'Equipment deleted.');
});

module.exports = router;
