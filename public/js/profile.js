// Profile page: shows the account stored in the session (kept from the login assignment).
'use strict';

runAction(async () => {
    const user = await loadCurrentUser();
    $('#profile-heading').textContent = `Hello, ${user.username}`;
    $('#profile-intro').className = '';
    $('#profile-intro').textContent = 'These details come from your current session and the accounts table.';
    $('#profile-username').textContent = user.username;
    $('#profile-email').textContent = user.email;
    $('#profile-role').innerHTML = statusBadge(user.role);
    $('#profile-created').textContent = formatDate(user.createdAt);
    $('#profile-details').hidden = false;
});
