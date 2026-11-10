// Helpers shared by every UniHub page.
// All data shown on the pages comes from the /api endpoints, which read MySQL.
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

// Show a success or error message at the top of the page.
function showNotice(message, isError = false) {
    const notice = $('#notice');
    notice.className = isError ? 'notice error' : 'notice';
    notice.textContent = message;
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

function statusBadge(status) {
    const safe = escapeHTML(status);
    return `<span class="badge badge-${safe.toLowerCase()}">${safe}</span>`;
}

function emptyState(text) {
    return `<p class="empty">${escapeHTML(text)}</p>`;
}

function actionButton(action, id, label, style = 'secondary') {
    return `<button type="button" class="${style}" data-action="${action}" data-id="${id}">${escapeHTML(label)}</button>`;
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

// Load the logged-in account and show the Log out button.
async function loadCurrentUser() {
    const { data } = await apiRequest('/auth/me');
    $('#logout').hidden = false;
    return data;
}

// Highlight the current page in the navigation bar.
for (const link of document.querySelectorAll('.site-header nav a')) {
    const linkPage = link.pathname.replace(/\.html$/, '');
    if (linkPage === location.pathname.replace(/\.html$/, '')) {
        link.setAttribute('aria-current', 'page');
    }
}

$('#logout').addEventListener('click', () =>
    runAction(async () => {
        await apiRequest('/auth/logout', { method: 'POST' });
        location.href = '/login.html?loggedOut=1';
    })
);
