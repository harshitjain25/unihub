// Dashboard: counts, upcoming items, recent activity, and an admin overview.
'use strict';

// Rows for a list-group card, or a muted line when there is nothing to show.
function listItems(rows, renderRow, emptyText) {
    return rows.length
        ? rows.map((row) => `<div class="list-group-item">${renderRow(row)}</div>`).join('')
        : `<div class="list-group-item text-secondary">${escapeHTML(emptyText)}</div>`;
}

// One line of a list item: main text, a muted line under it, and something on the right.
function listRow(main, sub, right = '') {
    return `
        <div class="row align-items-center">
            <div class="col text-truncate">
                <div class="text-body text-truncate">${main}</div>
                <div class="text-secondary small text-truncate">${sub}</div>
            </div>
            ${right ? `<div class="col-auto">${right}</div>` : ''}
        </div>`;
}

function statCard(number, label, icon, color, href) {
    return `
        <div class="col-sm-6 col-lg-4">
            <a class="card card-sm card-link" href="${href}">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <span class="avatar bg-${color} text-white"><i class="ti ${icon}" aria-hidden="true"></i></span>
                        </div>
                        <div class="col">
                            <div class="h2 mb-0">${Number(number)}</div>
                            <div class="text-secondary">${escapeHTML(label)}</div>
                        </div>
                    </div>
                </div>
            </a>
        </div>`;
}

function adminStat(number, label) {
    return `
        <div class="datagrid-item">
            <div class="datagrid-title">${escapeHTML(label)}</div>
            <div class="datagrid-content h2 mb-0">${Number(number)}</div>
        </div>`;
}

runAction(async () => {
    await loadCurrentUser();
    const { data } = await apiRequest('/dashboard');
    const { user, counts } = data;

    $('#welcome').textContent = `Welcome back, ${user.username}`;
    $('#role-line').innerHTML = `Signed in as ${statusBadge(user.role === 'admin' ? 'admin' : 'student')}`;

    const welcome = sessionStorage.getItem('welcomeMessage');
    if (welcome) {
        showNotice(welcome);
        sessionStorage.removeItem('welcomeMessage');
    }

    $('#stats').innerHTML = [
        statCard(counts.activeBookings, 'Active equipment bookings', 'ti-device-laptop', 'blue', '/equipment.html'),
        statCard(counts.openReports, 'Your open lost & found reports', 'ti-search', 'orange', '/lost-found.html'),
        statCard(counts.joinedOpportunities, 'Volunteering opportunities joined', 'ti-heart-handshake', 'green', '/volunteering.html')
    ].join('');

    $('#upcoming-bookings').innerHTML = listItems(
        data.upcomingBookings,
        (b) => listRow(
            `${escapeHTML(b.equipment_name)} × ${b.quantity}`,
            `${formatDate(b.start_date)} → ${formatDate(b.end_date)}`,
            statusBadge(b.status)
        ),
        'No upcoming bookings yet.'
    );

    $('#upcoming-events').innerHTML = listItems(
        data.upcomingEvents,
        (o) => listRow(
            escapeHTML(o.title),
            `${formatDate(o.event_date)} · ${formatTime(o.start_time)} · ${escapeHTML(o.location)}`
        ),
        'No upcoming volunteering yet.'
    );

    $('#recent-activity').innerHTML = listItems(
        data.recentActivity,
        (a) => listRow(escapeHTML(a.summary), formatDate(a.happened_at)),
        'Your bookings, reports, and signups will appear here.'
    );

    if (data.admin) {
        $('#admin-section').hidden = false;
        $('#admin-stats').innerHTML = [
            adminStat(data.admin.pendingBookings, 'Bookings awaiting review'),
            adminStat(data.admin.approvedBookings, 'Approved bookings out'),
            adminStat(data.admin.equipmentItems, 'Equipment items'),
            adminStat(data.admin.openReports, 'Open lost & found reports'),
            adminStat(data.admin.upcomingOpportunities, 'Upcoming opportunities'),
            adminStat(data.admin.accounts, 'Registered accounts')
        ].join('');
    }
});
