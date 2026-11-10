// Lost and found page: create, search, edit, resolve, and delete reports.
'use strict';

let currentUser;
let reports = [];

const reportForm = $('#report-form');

function canManage(report) {
    return report.user_id === currentUser.id || currentUser.role === 'admin';
}

function reportCard(report) {
    const ownerButtons = canManage(report)
        ? `<div class="actions">
               ${actionButton('edit', report.id, 'Edit')}
               ${report.status === 'Open' ? actionButton('resolve', report.id, 'Mark resolved', '') : ''}
               ${actionButton('delete', report.id, 'Delete', 'danger')}
           </div>`
        : '';
    return `
        <article class="card">
            <p class="eyebrow">${escapeHTML(report.report_type)} · ${escapeHTML(report.category)}</p>
            <h3>${escapeHTML(report.item_name)}</h3>
            ${statusBadge(report.report_type)} ${statusBadge(report.status)}
            <p class="description">${escapeHTML(report.description)}</p>
            <p class="meta">${escapeHTML(report.location)} · ${formatDate(report.item_date)}</p>
            <p class="meta">Contact: <a href="mailto:${escapeHTML(report.contact_email)}">${escapeHTML(report.contact_email)}</a>
               · Reported by ${escapeHTML(report.reported_by)}</p>
            ${ownerButtons}
        </article>`;
}

async function loadReports() {
    const query = new URLSearchParams(formValues($('#report-filters')));
    reports = (await apiRequest(`/lost-found?${query}`)).data;
    $('#report-list').innerHTML = reports.length ? reports.map(reportCard).join('') : emptyState('No reports match these filters.');
}

function resetReportForm() {
    reportForm.reset();
    reportForm.elements.id.value = '';
    reportForm.elements.contact_email.value = currentUser.email;
    reportForm.elements.item_date.max = todayString();
    $('#editor-title').textContent = 'New report';
}

$('#report-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(loadReports);
});

$('#cancel-edit').addEventListener('click', resetReportForm);

reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(reportForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/lost-found/${values.id}` : '/lost-found', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
        resetReportForm();
        showNotice(result.message);
        await loadReports();
    });
});

$('#report-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const report = reports.find((row) => row.id === Number(button.dataset.id));

    if (button.dataset.action === 'edit') {
        fillForm(reportForm, report);
        $('#editor-title').textContent = `Edit report: ${report.item_name}`;
        $('#report-editor').scrollIntoView({ behavior: 'smooth' });
    }
    if (button.dataset.action === 'resolve') {
        runAction(async () => {
            await apiRequest(`/lost-found/${report.id}`, { method: 'PUT', body: { ...report, status: 'Resolved' } });
            showNotice('Report marked as resolved.');
            await loadReports();
        });
    }
    if (button.dataset.action === 'delete' && confirm(`Delete the report "${report.item_name}"? This cannot be undone.`)) {
        runAction(async () => {
            const result = await apiRequest(`/lost-found/${report.id}`, { method: 'DELETE' });
            showNotice(result.message);
            await loadReports();
        });
    }
});

runAction(async () => {
    currentUser = await loadCurrentUser();
    resetReportForm();
    await loadReports();
});
