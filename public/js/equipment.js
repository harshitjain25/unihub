// Equipment page: browse and book equipment; admins manage equipment and bookings.
'use strict';

let currentUser;
let equipmentItems = [];

const equipmentForm = $('#equipment-form');
const bookingForm = $('#booking-form');

const CATEGORY_ICONS = {
    Laptop: 'ti-device-laptop',
    Camera: 'ti-camera',
    Projector: 'ti-presentation',
    'Audio equipment': 'ti-headphones',
    'Lab equipment': 'ti-microscope',
    Other: 'ti-package'
};

// ---------- Equipment list ----------

function equipmentCard(item) {
    const canBook = item.status === 'active' && item.available_quantity > 0;
    const percentAvailable = item.total_quantity ? (item.available_quantity / item.total_quantity) * 100 : 0;
    const barColor = item.available_quantity === 0 ? 'bg-red' : percentAvailable < 35 ? 'bg-orange' : 'bg-green';
    const buttons = [
        canBook ? actionButton('book', item.id, 'Book', '') : '',
        currentUser.role === 'admin' ? actionButton('edit', item.id, 'Edit') + actionButton('delete', item.id, 'Delete', 'danger') : ''
    ].join('');

    return `
        <div class="col-md-6 col-xl-4">
            <div class="card h-100">
                <div class="card-body">
                    <div class="d-flex align-items-start mb-3">
                        <span class="avatar bg-primary-lt me-3"><i class="ti ${CATEGORY_ICONS[item.category] || 'ti-package'}" aria-hidden="true"></i></span>
                        <div class="flex-fill">
                            <div class="text-secondary small">${escapeHTML(item.category)}</div>
                            <h3 class="card-title mb-0">${escapeHTML(item.name)}</h3>
                        </div>
                        ${statusBadge(item.status)}
                    </div>
                    <p class="text-secondary card-description">${escapeHTML(item.description)}</p>
                    <div class="d-flex small mb-1">
                        <span class="text-secondary">Available</span>
                        <span class="ms-auto fw-bold">${item.available_quantity} of ${item.total_quantity}</span>
                    </div>
                    <div class="progress progress-sm">
                        <div class="progress-bar ${barColor}" data-progress="${percentAvailable}" role="progressbar"
                             aria-valuenow="${item.available_quantity}" aria-valuemin="0" aria-valuemax="${item.total_quantity}"
                             aria-label="${item.available_quantity} of ${item.total_quantity} available"></div>
                    </div>
                </div>
                ${buttons ? `<div class="card-footer"><div class="btn-list">${buttons}</div></div>` : ''}
            </div>
        </div>`;
}

async function loadEquipment() {
    const query = new URLSearchParams(formValues($('#equipment-filters')));
    equipmentItems = (await apiRequest(`/equipment?${query}`)).data;
    const list = $('#equipment-list');
    list.innerHTML = equipmentItems.length
        ? equipmentItems.map(equipmentCard).join('')
        : emptyState('No equipment matches your search.', 'ti-search');
    applyProgressBars(list);
}

// ---------- Bookings ----------

function bookingTable(headings, rows) {
    return `
        <table class="table card-table table-vcenter">
            <thead><tr>${headings.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>`;
}

function myBookingRow(booking) {
    const canCancel = ['pending', 'approved'].includes(booking.status);
    return `
        <tr>
            <td>${escapeHTML(booking.equipment_name)}</td>
            <td class="text-secondary">${formatDate(booking.start_date)} → ${formatDate(booking.end_date)}</td>
            <td>${booking.quantity}</td>
            <td>${statusBadge(booking.status)}</td>
            <td class="text-end">${canCancel ? actionButton('cancel-booking', booking.id, 'Cancel booking') : ''}</td>
        </tr>`;
}

// A button that changes a booking to `status` when an administrator clicks it.
function statusButton(bookingId, status, label, style) {
    return `<button type="button" class="btn ${style}" data-action="set-status" data-status="${status}" data-id="${bookingId}">${label}</button>`;
}

// Buttons an administrator sees for each booking status.
function adminBookingButtons(booking) {
    if (booking.status === 'pending') {
        return statusButton(booking.id, 'approved', 'Approve', 'btn-success') + statusButton(booking.id, 'rejected', 'Reject', 'btn-outline-danger');
    }
    if (booking.status === 'approved') {
        return statusButton(booking.id, 'returned', 'Mark returned', 'btn-primary');
    }
    return '';
}

function adminBookingRow(b) {
    return `
        <tr>
            <td>
                <div class="d-flex align-items-center">
                    <span class="avatar avatar-sm me-2">${escapeHTML(initials(b.username))}</span>
                    ${escapeHTML(b.username)}
                </div>
            </td>
            <td>${escapeHTML(b.equipment_name)}</td>
            <td class="text-secondary">${formatDate(b.start_date)} → ${formatDate(b.end_date)}</td>
            <td>${b.quantity}</td>
            <td>${statusBadge(b.status)}</td>
            <td class="text-end"><div class="btn-list justify-content-end flex-nowrap">${adminBookingButtons(b)}</div></td>
        </tr>`;
}

async function loadBookings() {
    const mine = (await apiRequest('/bookings/mine')).data;
    $('#my-bookings').innerHTML = mine.length
        ? bookingTable(['Equipment', 'Dates', 'Qty', 'Status', '<span class="visually-hidden">Actions</span>'], mine.map(myBookingRow))
        : emptyState('You have no bookings yet. Pick an item above to book it.', 'ti-calendar');

    if (currentUser.role !== 'admin') return;
    const query = new URLSearchParams(formValues($('#booking-filters')));
    const all = (await apiRequest(`/bookings?${query}`)).data;
    $('#all-bookings').innerHTML = all.length
        ? bookingTable(['Student', 'Equipment', 'Dates', 'Qty', 'Status', '<span class="visually-hidden">Actions</span>'], all.map(adminBookingRow))
        : emptyState('No bookings with this status.', 'ti-checklist');
}

async function reloadAll() {
    await Promise.all([loadEquipment(), loadBookings()]);
}

// ---------- Event handlers ----------

$('#equipment-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(loadEquipment);
});

$('#booking-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(loadBookings);
});

function resetEquipmentForm() {
    equipmentForm.reset();
    equipmentForm.elements.id.value = '';
    $('#editor-title').textContent = 'Add equipment';
}

$('#add-equipment').addEventListener('click', () => {
    resetEquipmentForm();
    openModal('equipment-editor');
});

$('#equipment-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const item = equipmentItems.find((row) => row.id === Number(button.dataset.id));

    if (button.dataset.action === 'book') {
        bookingForm.reset();
        bookingForm.elements.equipment_id.value = item.id;
        bookingForm.elements.quantity.max = item.available_quantity;
        bookingForm.elements.start_date.min = todayString();
        bookingForm.elements.end_date.min = todayString();
        $('#booking-title').textContent = `Book ${item.name} (${item.available_quantity} available)`;
        openModal('booking-panel');
    }
    if (button.dataset.action === 'edit') {
        fillForm(equipmentForm, item);
        $('#editor-title').textContent = `Edit ${item.name}`;
        openModal('equipment-editor');
    }
    if (button.dataset.action === 'delete' && confirm(`Delete "${item.name}"? This cannot be undone.`)) {
        runAction(async () => {
            const result = await apiRequest(`/equipment/${item.id}`, { method: 'DELETE' });
            showNotice(result.message);
            await loadEquipment();
        });
    }
});

bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const result = await apiRequest('/bookings', { method: 'POST', body: formValues(bookingForm) });
        closeModal('booking-panel');
        showNotice(result.message);
        await reloadAll();
    });
});

$('#my-bookings').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="cancel-booking"]');
    if (!button || !confirm('Cancel this booking?')) return;
    runAction(async () => {
        const result = await apiRequest(`/bookings/${button.dataset.id}`, { method: 'DELETE' });
        showNotice(result.message);
        await reloadAll();
    });
});

$('#all-bookings').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="set-status"]');
    if (!button) return;
    const status = button.dataset.status;
    if (status === 'rejected' && !confirm('Reject this booking?')) return;
    runAction(async () => {
        const result = await apiRequest(`/bookings/${button.dataset.id}/status`, { method: 'PUT', body: { status } });
        showNotice(result.message);
        await reloadAll();
    });
});

equipmentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(equipmentForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/equipment/${values.id}` : '/equipment', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
        closeModal('equipment-editor');
        resetEquipmentForm();
        showNotice(result.message);
        await loadEquipment();
    });
});

// ---------- Start ----------

runAction(async () => {
    currentUser = await loadCurrentUser();
    const isAdmin = currentUser.role === 'admin';
    $('#add-equipment').hidden = !isAdmin;
    $('#manage-bookings').hidden = !isAdmin;
    await reloadAll();

    // Links from the dashboard: #equipment-editor opens the form, #manage-bookings scrolls to the table.
    if (location.hash === '#equipment-editor' && isAdmin) {
        resetEquipmentForm();
        openModal('equipment-editor');
    } else if (location.hash) {
        document.querySelector(location.hash)?.scrollIntoView();
    }
});
