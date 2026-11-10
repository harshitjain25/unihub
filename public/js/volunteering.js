// Volunteering page: browse, join, and leave opportunities; admins manage them.
'use strict';

let currentUser;
let opportunities = [];

const opportunityForm = $('#opportunity-form');

function opportunityCard(o) {
    const isAdmin = currentUser.role === 'admin';
    const isPast = Boolean(o.has_started);
    const open = o.status === 'active' && o.remaining_slots > 0 && !isPast;
    let studentButton = '';
    if (o.joined && !isPast) studentButton = actionButton('leave', o.id, 'Cancel registration');
    else if (open) studentButton = actionButton('join', o.id, 'Join', '');

    const adminButtons = isAdmin
        ? actionButton('signups', o.id, 'View registrations') + actionButton('edit', o.id, 'Edit') + actionButton('delete', o.id, 'Delete', 'danger')
        : '';

    return `
        <article class="card">
            <p class="eyebrow">${escapeHTML(o.organization)}</p>
            <h3>${escapeHTML(o.title)}</h3>
            ${statusBadge(o.status)}
            ${isPast ? '<span class="badge badge-returned">Past event</span>' : ''}
            ${o.joined ? '<span class="badge badge-approved">You joined</span>' : ''}
            <p class="description">${escapeHTML(o.description)}</p>
            <p class="meta">${formatDate(o.event_date)} · ${formatTime(o.start_time)}–${formatTime(o.end_time)}<br>${escapeHTML(o.location)}</p>
            <p><strong>${o.remaining_slots} of ${o.total_slots}</strong> slots remaining</p>
            <div class="actions">${studentButton}${adminButtons}</div>
            <div id="signups-${o.id}" hidden></div>
        </article>`;
}

async function loadOpportunities() {
    const filters = formValues($('#opportunity-filters'));
    const url = filters.show === 'mine'
        ? '/volunteering/mine'
        : `/volunteering?${new URLSearchParams({ search: filters.search, status: filters.status })}`;
    opportunities = (await apiRequest(url)).data;
    $('#opportunity-list').innerHTML = opportunities.length
        ? opportunities.map(opportunityCard).join('')
        : emptyState('No opportunities match these filters.');
}

async function toggleSignups(id) {
    const box = $(`#signups-${id}`);
    if (!box.hidden) {
        box.hidden = true;
        return;
    }
    const signups = (await apiRequest(`/volunteering/${id}/signups`)).data;
    box.innerHTML = signups.length
        ? `<ul class="list">${signups.map((s) => `<li>${escapeHTML(s.username)} <span class="meta">${escapeHTML(s.email)}</span></li>`).join('')}</ul>`
        : emptyState('No registrations yet.');
    box.hidden = false;
}

function resetOpportunityForm() {
    opportunityForm.reset();
    opportunityForm.elements.id.value = '';
    $('#editor-title').firstChild.textContent = 'Add opportunity ';
}

$('#opportunity-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(loadOpportunities);
});

$('#cancel-edit').addEventListener('click', resetOpportunityForm);

opportunityForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(opportunityForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/volunteering/${values.id}` : '/volunteering', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
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
        $('#editor-title').firstChild.textContent = `Edit ${o.title} `;
        $('#opportunity-editor').scrollIntoView({ behavior: 'smooth' });
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
    $('#opportunity-editor').hidden = currentUser.role !== 'admin';
    await loadOpportunities();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
