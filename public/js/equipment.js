// Equipment page: browse and book equipment; admins manage equipment and bookings.
'use strict';

let currentUser;
let equipmentItems = [];

const equipmentForm = $('#equipment-form');
const bookingForm = $('#booking-form');

// ---------- Equipment list ----------

function equipmentCard(item) {
    const canBook = item.status === 'active' && item.available_quantity > 0;
    const adminButtons = currentUser.role === 'admin'
        ? actionButton('edit', item.id, 'Edit') + actionButton('delete', item.id, 'Delete', 'danger')
        : '';
    return `
        <article class="card">
            <p class="eyebrow">${escapeHTML(item.category)}</p>
            <h3>${escapeHTML(item.name)}</h3>
            ${statusBadge(item.status)}
            <p class="description">${escapeHTML(item.description)}</p>
            <p><strong>${item.available_quantity} of ${item.total_quantity}</strong> available</p>
            <div class="actions">
                ${canBook ? actionButton('book', item.id, 'Book', '') : ''}
                ${adminButtons}
            </div>
        </article>`;
}

async function loadEquipment() {
    const query = new URLSearchParams(formValues($('#equipment-filters')));
    equipmentItems = (await apiRequest(`/equipment?${query}`)).data;
    $('#equipment-list').innerHTML = equipmentItems.length
        ? equipmentItems.map(equipmentCard).join('')
        : emptyState('No equipment matches your search.');
}

// ---------- Bookings ----------

function myBookingCard(booking) {
    const canCancel = ['pending', 'approved'].includes(booking.status);
    return `
        <article class="card">
            <h3>${escapeHTML(booking.equipment_name)}</h3>
            ${statusBadge(booking.status)}
            <p class="meta">${formatDate(booking.start_date)} → ${formatDate(booking.end_date)} · Quantity ${booking.quantity}</p>
            ${canCancel ? `<div class="actions">${actionButton('cancel-booking', booking.id, 'Cancel booking')}</div>` : ''}
        </article>`;
}

// A button that changes a booking to `status` when an administrator clicks it.
function statusButton(bookingId, status, label, style) {
    return `<button type="button" class="${style}" data-action="set-status" data-status="${status}" data-id="${bookingId}">${label}</button>`;
}

// Buttons an administrator sees for each booking status.
function adminBookingButtons(booking) {
    if (booking.status === 'pending') {
        return statusButton(booking.id, 'approved', 'Approve', '') + statusButton(booking.id, 'rejected', 'Reject', 'danger');
    }
    if (booking.status === 'approved') {
        return statusButton(booking.id, 'returned', 'Mark returned', '');
    }
    return '';
}

async function loadBookings() {
    const mine = (await apiRequest('/bookings/mine')).data;
    $('#my-bookings').innerHTML = mine.length ? mine.map(myBookingCard).join('') : emptyState('You have no bookings yet.');

    if (currentUser.role !== 'admin') return;
    const query = new URLSearchParams(formValues($('#booking-filters')));
    const all = (await apiRequest(`/bookings?${query}`)).data;
    $('#all-bookings').innerHTML = all.length
        ? `<table>
               <thead><tr><th>Student</th><th>Equipment</th><th>Dates</th><th>Qty</th><th>Status</th><th>Actions</th></tr></thead>
               <tbody>${all.map((b) => `
                   <tr>
                       <td>${escapeHTML(b.username)}</td>
                       <td>${escapeHTML(b.equipment_name)}</td>
                       <td>${formatDate(b.start_date)} → ${formatDate(b.end_date)}</td>
                       <td>${b.quantity}</td>
                       <td>${statusBadge(b.status)}</td>
                       <td><div class="actions">${adminBookingButtons(b)}</div></td>
                   </tr>`).join('')}
               </tbody>
           </table>`
        : emptyState('No bookings with this status.');
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
        $('#booking-panel').hidden = false;
        $('#booking-panel').scrollIntoView({ behavior: 'smooth' });
    }
    if (button.dataset.action === 'edit') {
        fillForm(equipmentForm, item);
        $('#editor-title').firstChild.textContent = `Edit ${item.name} `;
        $('#equipment-editor').scrollIntoView({ behavior: 'smooth' });
    }
    if (button.dataset.action === 'delete' && confirm(`Delete "${item.name}"? This cannot be undone.`)) {
        runAction(async () => {
            const result = await apiRequest(`/equipment/${item.id}`, { method: 'DELETE' });
            showNotice(result.message);
            await loadEquipment();
        });
    }
});

$('#close-booking').addEventListener('click', () => {
    $('#booking-panel').hidden = true;
});

bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const result = await apiRequest('/bookings', { method: 'POST', body: formValues(bookingForm) });
        $('#booking-panel').hidden = true;
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

function resetEquipmentForm() {
    equipmentForm.reset();
    equipmentForm.elements.id.value = '';
    $('#editor-title').firstChild.textContent = 'Add equipment ';
}

$('#cancel-edit').addEventListener('click', resetEquipmentForm);

equipmentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runAction(async () => {
        const values = formValues(equipmentForm);
        const editing = Boolean(values.id);
        const result = await apiRequest(editing ? `/equipment/${values.id}` : '/equipment', {
            method: editing ? 'PUT' : 'POST',
            body: values
        });
        resetEquipmentForm();
        showNotice(result.message);
        await loadEquipment();
    });
});

// ---------- Start ----------

runAction(async () => {
    currentUser = await loadCurrentUser();
    const isAdmin = currentUser.role === 'admin';
    $('#equipment-editor').hidden = !isAdmin;
    $('#manage-bookings').hidden = !isAdmin;
    await reloadAll();
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
});
