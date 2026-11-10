// Equipment bookings. Students book and cancel their own; admins manage all.
//
// Stock rule: a booking that is 'pending' or 'approved' holds its quantity.
// Moving it to 'rejected', 'returned', or 'cancelled' gives the quantity back.
// Every change runs in a transaction that locks the equipment row first, so
// two people can never book the last unit at the same time.
const express = require('express');
const db = require('../lib/db');
const { httpError, sendSuccess } = require('../lib/http');
const { requireInteger, requireId, requireDate, requireChoice, today } = require('../lib/validate');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const HOLDS_STOCK = ['pending', 'approved'];

// Which status changes an administrator may make.
const ALLOWED_CHANGES = {
    pending: ['approved', 'rejected', 'cancelled'],
    approved: ['returned', 'cancelled']
};

const BOOKING_COLUMNS = `
    SELECT b.id, b.user_id, b.equipment_id, b.start_date, b.end_date, b.quantity, b.status,
           b.created_at, b.updated_at, e.name AS equipment_name, e.category, a.username
    FROM bookings b
    JOIN equipment e ON e.id = b.equipment_id
    JOIN accounts a ON a.user_id = b.user_id`;

// GET /api/bookings/mine
router.get('/mine', async (req, res) => {
    const [rows] = await db.execute(`${BOOKING_COLUMNS} WHERE b.user_id = ? ORDER BY b.start_date DESC, b.id DESC`, [req.user.id]);
    sendSuccess(res, 'Your bookings.', rows);
});

// GET /api/bookings?status= (admin)
router.get('/', requireAdmin, async (req, res) => {
    let sql = BOOKING_COLUMNS;
    const params = [];
    if (req.query.status) {
        sql += ' WHERE b.status = ?';
        params.push(requireChoice(req.query.status, ['pending', 'approved', 'rejected', 'returned', 'cancelled'], 'Status'));
    }
    const [rows] = await db.execute(`${sql} ORDER BY FIELD(b.status, 'pending', 'approved') DESC, b.created_at DESC`, params);
    sendSuccess(res, 'All bookings.', rows);
});

// POST /api/bookings
router.post('/', async (req, res) => {
    const equipmentId = requireInteger(req.body.equipment_id, 'Equipment');
    const quantity = requireInteger(req.body.quantity, 'Quantity');
    const startDate = requireDate(req.body.start_date, 'Start date');
    const endDate = requireDate(req.body.end_date, 'End date');
    if (startDate < today()) throw httpError(400, 'Start date cannot be in the past.');
    if (startDate > endDate) throw httpError(400, 'Start date cannot be after the end date.');

    const bookingId = await db.transaction(async (connection) => {
        const [rows] = await connection.execute('SELECT * FROM equipment WHERE id = ? FOR UPDATE', [equipmentId]);
        const equipment = rows[0];
        if (!equipment) throw httpError(404, 'Equipment not found.');
        if (equipment.status !== 'active') throw httpError(400, 'This equipment is not available for booking.');
        if (quantity > equipment.available_quantity) {
            throw httpError(400, `Only ${equipment.available_quantity} unit(s) are available.`);
        }

        await connection.execute('UPDATE equipment SET available_quantity = available_quantity - ? WHERE id = ?', [quantity, equipmentId]);
        const [result] = await connection.execute(
            'INSERT INTO bookings (user_id, equipment_id, start_date, end_date, quantity) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, equipmentId, startDate, endDate, quantity]
        );
        return result.insertId;
    });

    sendSuccess(res, 'Booking requested. An administrator will review it.', { id: bookingId }, 201);
});

// Change a booking's status inside a transaction and return stock when needed.
// `check(booking)` throws if this user may not make the change.
async function changeBookingStatus(bookingId, newStatus, check) {
    await db.transaction(async (connection) => {
        const [found] = await connection.execute('SELECT equipment_id FROM bookings WHERE id = ?', [bookingId]);
        if (!found[0]) throw httpError(404, 'Booking not found.');

        // Lock the equipment row, then the booking (same order as booking creation).
        await connection.execute('SELECT id FROM equipment WHERE id = ? FOR UPDATE', [found[0].equipment_id]);
        const [rows] = await connection.execute('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [bookingId]);
        const booking = rows[0];
        check(booking);

        if (HOLDS_STOCK.includes(booking.status) && !HOLDS_STOCK.includes(newStatus)) {
            await connection.execute(
                'UPDATE equipment SET available_quantity = available_quantity + ? WHERE id = ?',
                [booking.quantity, booking.equipment_id]
            );
        }
        await connection.execute('UPDATE bookings SET status = ? WHERE id = ?', [newStatus, bookingId]);
    });
}

// PUT /api/bookings/:id/status (admin) — approve, reject, mark returned, or cancel
router.put('/:id/status', requireAdmin, async (req, res) => {
    const newStatus = requireChoice(req.body.status, ['approved', 'rejected', 'returned', 'cancelled'], 'Status');
    await changeBookingStatus(requireId(req.params.id), newStatus, (booking) => {
        const allowed = ALLOWED_CHANGES[booking.status] || [];
        if (!allowed.includes(newStatus)) {
            throw httpError(400, `A ${booking.status} booking cannot be changed to ${newStatus}.`);
        }
    });
    sendSuccess(res, `Booking ${newStatus}.`);
});

// DELETE /api/bookings/:id — a student cancels their own active booking
router.delete('/:id', async (req, res) => {
    await changeBookingStatus(requireId(req.params.id), 'cancelled', (booking) => {
        if (booking.user_id !== req.user.id) throw httpError(403, 'You can only cancel your own bookings.');
        if (!HOLDS_STOCK.includes(booking.status)) throw httpError(400, 'Only pending or approved bookings can be cancelled.');
    });
    sendSuccess(res, 'Booking cancelled.');
});

module.exports = router;
