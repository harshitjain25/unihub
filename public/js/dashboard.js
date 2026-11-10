// Dashboard: counts, upcoming items, recent activity, and an admin overview.
'use strict';

function listItems(rows, renderRow, emptyText) {
    return rows.length ? rows.map((row) => `<li>${renderRow(row)}</li>`).join('') : `<li class="empty">${escapeHTML(emptyText)}</li>`;
}

function statCard(number, label) {
    return `<article class="card"><div class="stat">${Number(number)}</div><p>${escapeHTML(label)}</p></article>`;
}

runAction(async () => {
    await loadCurrentUser();
    const { data } = await apiRequest('/dashboard');
    const { user, counts } = data;

    $('#welcome').textContent = `Welcome back, ${user.username}.`;
    $('#role-line').className = '';
    $('#role-line').innerHTML = `Signed in as ${statusBadge(user.role === 'admin' ? 'admin' : 'student')}`;

    const welcome = sessionStorage.getItem('welcomeMessage');
    if (welcome) {
        showNotice(welcome);
        sessionStorage.removeItem('welcomeMessage');
    }

    $('#stats').innerHTML = [
        statCard(counts.activeBookings, 'Active equipment bookings'),
        statCard(counts.openReports, 'Your open lost & found reports'),
        statCard(counts.joinedOpportunities, 'Volunteering opportunities joined')
    ].join('');

    $('#upcoming-bookings').innerHTML = listItems(
        data.upcomingBookings,
        (b) => `<strong>${escapeHTML(b.equipment_name)}</strong> × ${b.quantity} ${statusBadge(b.status)}
                <div class="meta">${formatDate(b.start_date)} → ${formatDate(b.end_date)}</div>`,
        'No upcoming bookings. Browse equipment to get started.'
    );

    $('#upcoming-events').innerHTML = listItems(
        data.upcomingEvents,
        (o) => `<strong>${escapeHTML(o.title)}</strong>
                <div class="meta">${formatDate(o.event_date)} · ${formatTime(o.start_time)} · ${escapeHTML(o.location)}</div>`,
        'No upcoming volunteering. Find an opportunity to join.'
    );

    $('#recent-activity').innerHTML = listItems(
        data.recentActivity,
        (a) => `${escapeHTML(a.summary)}<div class="meta">${formatDate(a.happened_at)}</div>`,
        'Nothing yet — your bookings, reports, and signups will appear here.'
    );

    if (data.admin) {
        $('#admin-section').hidden = false;
        $('#admin-stats').innerHTML = [
            statCard(data.admin.pendingBookings, 'Bookings awaiting review'),
            statCard(data.admin.approvedBookings, 'Approved bookings out'),
            statCard(data.admin.equipmentItems, 'Equipment items'),
            statCard(data.admin.openReports, 'Open lost & found reports'),
            statCard(data.admin.upcomingOpportunities, 'Upcoming opportunities'),
            statCard(data.admin.accounts, 'Registered accounts')
        ].join('');
    }
});
