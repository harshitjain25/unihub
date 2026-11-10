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
        ? `<div class="card-footer">
               <div class="btn-list">
                   ${actionButton('edit', report.id, 'Edit')}
                   ${report.status === 'Open' ? actionButton('resolve', report.id, 'Mark resolved', '') : ''}
                   ${actionButton('delete', report.id, 'Delete', 'danger')}
               </div>
           </div>`
        : '';
    const icon = report.report_type === 'Lost' ? 'ti-help-circle' : 'ti-hand-finger';
    const iconColor = report.report_type === 'Lost' ? 'bg-red-lt' : 'bg-teal-lt';

    return `
        <div class="col-md-6 col-xl-4">
            <div class="card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-start mb-3">
                        <span class="avatar ${iconColor} me-3"><i class="ti ${icon}" aria-hidden="true"></i></span>
                        <div class="flex-fill">
                            <div class="text-secondary small">${escapeHTML(report.category)}</div>
                            <h3 class="card-title mb-0">${escapeHTML(report.item_name)}</h3>
                        </div>
                        <div class="d-flex flex-column align-items-end gap-1">
                            ${statusBadge(report.report_type)} ${statusBadge(report.status)}
                        </div>
                    </div>
                    <p class="text-secondary card-description">${escapeHTML(report.description)}</p>
                    <ul class="list-unstyled small text-secondary mb-0">
                        <li class="mb-1"><i class="ti ti-map-pin me-1" aria-hidden="true"></i>${escapeHTML(report.location)}</li>
                        <li class="mb-1"><i class="ti ti-calendar me-1" aria-hidden="true"></i>${formatDate(report.item_date)}</li>
                        <li class="mb-1 text-truncate"><i class="ti ti-mail me-1" aria-hidden="true"></i><a href="mailto:${escapeHTML(report.contact_email)}">${escapeHTML(report.contact_email)}</a></li>
                        <li><i class="ti ti-user me-1" aria-hidden="true"></i>Reported by ${escapeHTML(report.reported_by)}</li>
                    </ul>
                </div>
                ${ownerButtons}
            </div>
        </div>`;
}

async function loadReports() {
    const query = new URLSearchParams(formValues($('#report-filters')));
    reports = (await apiRequest(`/lost-found?${query}`)).data;
    $('#report-list').innerHTML = reports.length
        ? reports.map(reportCard).join('')
        : emptyState('No reports match these filters.', 'ti-search');
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

$('#new-report').addEventListener('click', () => {
    resetReportForm();
    openModal('report-editor');
});

reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(reportForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/lost-found/${values.id}` : '/lost-found', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
        closeModal('report-editor');
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
        openModal('report-editor');
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
