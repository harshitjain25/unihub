// Dashboard summary for the logged-in user: counts, upcoming items, and recent activity.
const express = require('express');
const db = require('../lib/db');
const { sendSuccess } = require('../lib/http');

const router = express.Router();

// GET /api/dashboard
router.get('/', async (req, res) => {
    const userId = req.user.id;

    const [[counts]] = await db.execute(
        `SELECT
            (SELECT COUNT(*) FROM bookings WHERE user_id = ? AND status IN ('pending', 'approved')) AS activeBookings,
            (SELECT COUNT(*) FROM lost_found_items WHERE user_id = ? AND status = 'Open') AS openReports,
            (SELECT COUNT(*) FROM volunteer_signups WHERE user_id = ?) AS joinedOpportunities`,
        [userId, userId, userId]
    );

    const [upcomingBookings] = await db.execute(
        `SELECT b.id, b.start_date, b.end_date, b.quantity, b.status, e.name AS equipment_name
         FROM bookings b JOIN equipment e ON e.id = b.equipment_id
         WHERE b.user_id = ? AND b.status IN ('pending', 'approved') AND b.end_date >= CURDATE()
         ORDER BY b.start_date LIMIT 5`,
        [userId]
    );

    const [upcomingEvents] = await db.execute(
        `SELECT o.id, o.title, o.organization, o.location, o.event_date, o.start_time, o.end_time, o.status
         FROM volunteer_signups s JOIN volunteer_opportunities o ON o.id = s.opportunity_id
         WHERE s.user_id = ? AND o.event_date >= CURDATE() AND o.status <> 'cancelled'
         ORDER BY o.event_date, o.start_time LIMIT 5`,
        [userId]
    );

    // Latest things this user did, across all three modules.
    const [recentActivity] = await db.execute(
        `(SELECT 'booking' AS type, CONCAT('Booked ', e.name, ' (', b.status, ')') AS summary, b.updated_at AS happened_at
            FROM bookings b JOIN equipment e ON e.id = b.equipment_id WHERE b.user_id = ?)
         UNION ALL
         (SELECT 'report', CONCAT(r.report_type, ' report: ', r.item_name, ' (', r.status, ')'), r.updated_at
            FROM lost_found_items r WHERE r.user_id = ?)
         UNION ALL
         (SELECT 'volunteering', CONCAT('Joined ', o.title), s.created_at
            FROM volunteer_signups s JOIN volunteer_opportunities o ON o.id = s.opportunity_id WHERE s.user_id = ?)
         ORDER BY happened_at DESC LIMIT 6`,
        [userId, userId, userId]
    );

    const summary = { user: req.user, counts, upcomingBookings, upcomingEvents, recentActivity };

    // Administrators also get campus-wide numbers for the management section.
    if (req.user.role === 'admin') {
        const [[admin]] = await db.execute(
            `SELECT
                (SELECT COUNT(*) FROM bookings WHERE status = 'pending') AS pendingBookings,
                (SELECT COUNT(*) FROM bookings WHERE status = 'approved') AS approvedBookings,
                (SELECT COUNT(*) FROM equipment) AS equipmentItems,
                (SELECT COUNT(*) FROM lost_found_items WHERE status = 'Open') AS openReports,
                (SELECT COUNT(*) FROM volunteer_opportunities WHERE event_date >= CURDATE() AND status IN ('active', 'full')) AS upcomingOpportunities,
                (SELECT COUNT(*) FROM accounts) AS accounts`
        );
        summary.admin = admin;
    }

    sendSuccess(res, 'Dashboard loaded.', summary);
});

module.exports = router;
