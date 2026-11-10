// Helpers shared by every UniHub page.
// All data shown on the pages comes from the /api endpoints, which read MySQL.
// The look comes from the Tabler UI kit (https://github.com/tabler/tabler).
'use strict';

// Shortcut for document.querySelector.
function $(selector) {
    return document.querySelector(selector);
}

// Escape text before inserting it into HTML, so user input can never run as code.
function escapeHTML(value) {
    const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, (character) => replacements[character]);
}

// Show a success or error message at the top of the page
// (or at the top of the dialog, when a form dialog is open).
// `extraHTML` is optional trusted markup (for example a link) added after the message.
function showNotice(message, isError = false, extraHTML = '') {
    const notice = document.querySelector('.modal.show .modal-notice') || $('#notice');
    const icon = isError ? 'ti-alert-circle' : 'ti-circle-check';
    notice.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
    notice.innerHTML = `<div class="d-flex gap-2"><i class="ti ${icon} alert-icon" aria-hidden="true"></i><div>${escapeHTML(message)} ${extraHTML}</div></div>`;
    notice.hidden = false;
    notice.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Call the UniHub API and return the parsed JSON.
// Throws an Error with the server's message when the request fails.
async function apiRequest(url, { method = 'GET', body } = {}) {
    const response = await fetch(`/api${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({ message: 'Unexpected response from the server.' }));

    if (!response.ok) {
        // The session expired: go back to the login page.
        if (response.status === 401 && !location.pathname.includes('login')) {
            location.href = '/login.html';
        }
        throw new Error(result.message);
    }
    return result;
}

// Run an async action while disabling buttons, and show any error as a notice.
async function runAction(action) {
    const buttons = [...document.querySelectorAll('button')];
    buttons.forEach((button) => (button.disabled = true));
    document.body.setAttribute('aria-busy', 'true');
    try {
        await action();
    } catch (error) {
        showNotice(error.message, true);
    } finally {
        buttons.forEach((button) => (button.disabled = false));
        document.body.removeAttribute('aria-busy');
    }
}

// Read a form's fields into a plain object: { fieldName: value }.
function formValues(form) {
    return Object.fromEntries(new FormData(form));
}

// Put a record's values back into a form (used by the Edit buttons).
function fillForm(form, record) {
    for (const [key, value] of Object.entries(record)) {
        const field = form.elements.namedItem(key);
        if (field) field.value = key.endsWith('_time') ? String(value).slice(0, 5) : value;
    }
}

// Open or close a Tabler (Bootstrap) modal dialog by its id.
function openModal(id) {
    const modalNotice = document.querySelector(`#${id} .modal-notice`);
    if (modalNotice) modalNotice.hidden = true;
    tabler.Modal.getOrCreateInstance(document.getElementById(id)).show();
}

function closeModal(id) {
    tabler.Modal.getOrCreateInstance(document.getElementById(id)).hide();
}

// Badge colours for every status used in UniHub.
const BADGE_COLORS = {
    pending: 'yellow', approved: 'green', rejected: 'red', returned: 'azure', cancelled: 'secondary',
    active: 'green', inactive: 'secondary', full: 'orange', completed: 'blue',
    open: 'azure', resolved: 'green', lost: 'red', found: 'teal',
    admin: 'purple', student: 'blue'
};

function statusBadge(status) {
    const text = String(status ?? '');
    const color = BADGE_COLORS[text.toLowerCase()] || 'secondary';
    const label = text.charAt(0).toUpperCase() + text.slice(1);
    return `<span class="badge bg-${color}-lt">${escapeHTML(label)}</span>`;
}

// A friendly "nothing here" block. Works inside grids, cards, and tables.
function emptyState(text, icon = 'ti-mood-empty') {
    return `
        <div class="col-12">
            <div class="empty py-4">
                <div class="empty-icon"><i class="ti ${icon}" aria-hidden="true"></i></div>
                <p class="empty-subtitle text-secondary">${escapeHTML(text)}</p>
            </div>
        </div>`;
}

// A button that page scripts listen for through data-action and data-id.
// style: '' (primary), 'secondary' (plain), or 'danger'.
const BUTTON_STYLES = { '': 'btn btn-primary', secondary: 'btn', danger: 'btn btn-outline-danger' };

function actionButton(action, id, label, style = 'secondary') {
    const classes = BUTTON_STYLES[style] ?? 'btn';
    return `<button type="button" class="${classes}" data-action="${action}" data-id="${id}">${escapeHTML(label)}</button>`;
}

// Progress bars get their width from data-progress (inline styles are blocked by the CSP).
function applyProgressBars(container) {
    for (const bar of container.querySelectorAll('[data-progress]')) {
        bar.style.width = `${Math.min(100, Math.max(0, Number(bar.dataset.progress)))}%`;
    }
}

// "2026-11-09" -> "Nov 9, 2026"
function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// "09:00:00" -> "9:00 AM"
function formatTime(value) {
    const [hours, minutes] = String(value).split(':').map(Number);
    return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Today's date as YYYY-MM-DD (for date input limits).
function todayString() {
    return new Date().toLocaleDateString('en-CA');
}

// "harshit_jain" -> "HJ" (shown in the avatar circle).
function initials(name) {
    const parts = String(name).split(/[\s._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// Load the logged-in account and show it in the account menu.
async function loadCurrentUser() {
    const { data } = await apiRequest('/auth/me');
    const menu = $('#user-menu');
    if (menu) {
        $('#user-initials').textContent = initials(data.username);
        $('#user-name').textContent = data.username;
        $('#user-role').textContent = data.role === 'admin' ? 'Administrator' : 'Student';
        menu.hidden = false;
    }
    return data;
}

// Highlight the current page in the navigation bar.
for (const link of document.querySelectorAll('#navbar-menu .nav-link')) {
    const linkPage = link.pathname.replace(/\.html$/, '');
    if (linkPage === location.pathname.replace(/\.html$/, '')) {
        link.closest('.nav-item').classList.add('active');
        link.setAttribute('aria-current', 'page');
    }
}

$('#logout')?.addEventListener('click', () =>
    runAction(async () => {
        await apiRequest('/auth/logout', { method: 'POST' });
        location.href = '/login.html?loggedOut=1';
    })
);
