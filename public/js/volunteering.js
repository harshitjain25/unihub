// Volunteering page: browse, join, and leave opportunities; admins manage them.
'use strict';

let currentUser;
let opportunities = [];

const opportunityForm = $('#opportunity-form');

// "2026-11-14" -> { month: "Nov", day: "14" } for the calendar block on each card.
function dateParts(value) {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return { month: date.toLocaleDateString(undefined, { month: 'short' }), day: date.getDate() };
}

function opportunityCard(o) {
    const isAdmin = currentUser.role === 'admin';
    const isPast = Boolean(o.has_started);
    const open = o.status === 'active' && o.remaining_slots > 0 && !isPast;
    const filledPercent = o.total_slots ? ((o.total_slots - o.remaining_slots) / o.total_slots) * 100 : 0;
    const { month, day } = dateParts(o.event_date);

    let studentButton = '';
    if (o.joined && !isPast) studentButton = actionButton('leave', o.id, 'Cancel registration');
    else if (open) studentButton = actionButton('join', o.id, 'Join', '');
    const adminButtons = isAdmin
        ? actionButton('signups', o.id, 'Registrations') + actionButton('edit', o.id, 'Edit') + actionButton('delete', o.id, 'Delete', 'danger')
        : '';
    const buttons = studentButton + adminButtons;

    return `
        <div class="col-md-6 col-xl-4">
            <div class="card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-start mb-3">
                        <div class="date-block me-3" aria-hidden="true">
                            <div class="date-block-month">${escapeHTML(month)}</div>
                            <div class="date-block-day">${day}</div>
                        </div>
                        <div class="flex-fill">
                            <div class="text-secondary small">${escapeHTML(o.organization)}</div>
                            <h3 class="card-title mb-1">${escapeHTML(o.title)}</h3>
                            <div class="d-flex flex-wrap gap-1">
                                ${statusBadge(o.status)}
                                ${isPast ? '<span class="badge bg-secondary-lt">Past event</span>' : ''}
                                ${o.joined ? '<span class="badge bg-green-lt"><i class="ti ti-check me-1" aria-hidden="true"></i>You joined</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <p class="text-secondary card-description">${escapeHTML(o.description)}</p>
                    <ul class="list-unstyled small text-secondary mb-3">
                        <li class="mb-1"><i class="ti ti-calendar me-1" aria-hidden="true"></i>${formatDate(o.event_date)}</li>
                        <li class="mb-1"><i class="ti ti-clock me-1" aria-hidden="true"></i>${formatTime(o.start_time)} – ${formatTime(o.end_time)}</li>
                        <li><i class="ti ti-map-pin me-1" aria-hidden="true"></i>${escapeHTML(o.location)}</li>
                    </ul>
                    <div class="d-flex small mb-1">
                        <span class="text-secondary">Slots left</span>
                        <span class="ms-auto fw-bold">${o.remaining_slots} of ${o.total_slots}</span>
                    </div>
                    <div class="progress progress-sm">
                        <div class="progress-bar ${o.remaining_slots === 0 ? 'bg-orange' : ''}" data-progress="${filledPercent}" role="progressbar"
                             aria-label="${o.total_slots - o.remaining_slots} of ${o.total_slots} slots taken"></div>
                    </div>
                    <div id="signups-${o.id}" class="mt-3" hidden></div>
                </div>
                ${buttons ? `<div class="card-footer"><div class="btn-list">${buttons}</div></div>` : ''}
            </div>
        </div>`;
}

async function loadOpportunities() {
    const filters = formValues($('#opportunity-filters'));
    const url = filters.show === 'mine'
        ? '/volunteering/mine'
        : `/volunteering?${new URLSearchParams({ search: filters.search, status: filters.status })}`;
    opportunities = (await apiRequest(url)).data;
    const list = $('#opportunity-list');
    list.innerHTML = opportunities.length
        ? opportunities.map(opportunityCard).join('')
        : emptyState('No opportunities match these filters.', 'ti-heart-handshake');
    applyProgressBars(list);
}

async function toggleSignups(id) {
    const box = $(`#signups-${id}`);
    if (!box.hidden) {
        box.hidden = true;
        return;
    }
    const signups = (await apiRequest(`/volunteering/${id}/signups`)).data;
    box.innerHTML = `
        <div class="fw-bold small mb-2">Registrations (${signups.length})</div>
        ${signups.length
            ? `<div class="list-group list-group-flush border rounded">${signups.map((s) => `
                <div class="list-group-item py-2">
                    <div class="d-flex align-items-center">
                        <span class="avatar avatar-xs me-2">${escapeHTML(initials(s.username))}</span>
                        <div class="text-truncate">
                            <div>${escapeHTML(s.username)}</div>
                            <div class="text-secondary small text-truncate">${escapeHTML(s.email)}</div>
                        </div>
                    </div>
                </div>`).join('')}</div>`
            : '<div class="text-secondary small">No registrations yet.</div>'}`;
    box.hidden = false;
}

function resetOpportunityForm() {
    opportunityForm.reset();
    opportunityForm.elements.id.value = '';
    $('#editor-title').textContent = 'Add opportunity';
}

$('#opportunity-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(loadOpportunities);
});

$('#add-opportunity').addEventListener('click', () => {
    resetOpportunityForm();
    openModal('opportunity-editor');
});

opportunityForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(opportunityForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/volunteering/${values.id}` : '/volunteering', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
        closeModal('opportunity-editor');
        resetOpportunityForm();
        showNotice(result.message);
        await loadOpportunities();
    });
});

$('#opportunity-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const o = opportunities.find((row) => row.id === Number(button.dataset.id));
    const action = button.dataset.action;

    if (action === 'join' || (action === 'leave' && confirm(`Cancel your registration for "${o.title}"?`))) {
        runAction(async () => {
            const result = await apiRequest(`/volunteering/${o.id}/signup`, { method: action === 'join' ? 'POST' : 'DELETE' });
            showNotice(result.message);
            await loadOpportunities();
        });
    }
    if (action === 'signups') runAction(() => toggleSignups(o.id));
    if (action === 'edit') {
        fillForm(opportunityForm, { ...o, status: o.status === 'full' ? 'active' : o.status });
        $('#editor-title').textContent = `Edit ${o.title}`;
        openModal('opportunity-editor');
    }
    if (action === 'delete' && confirm(`Delete "${o.title}" and all of its registrations? This cannot be undone.`)) {
        runAction(async () => {
            const result = await apiRequest(`/volunteering/${o.id}`, { method: 'DELETE' });
            showNotice(result.message);
            await loadOpportunities();
        });
    }
});

runAction(async () => {
    currentUser = await loadCurrentUser();
    const isAdmin = currentUser.role === 'admin';
    $('#add-opportunity').hidden = !isAdmin;
    await loadOpportunities();

    // Link from the dashboard: #opportunity-editor opens the form.
    if (location.hash === '#opportunity-editor' && isAdmin) {
        resetOpportunityForm();
        openModal('opportunity-editor');
    }
});
