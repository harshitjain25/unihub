// Login and registration pages.
'use strict';

const loginForm = $('#login-form');
const registerForm = $('#register-form');

if (loginForm) {
    // Coming back from /logout or the Log out button.
    if (new URLSearchParams(location.search).has('loggedOut')) {
        showNotice('You have logged out successfully.');
    }

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        runAction(async () => {
            const result = await apiRequest('/auth/login', { method: 'POST', body: formValues(loginForm) });
            sessionStorage.setItem('welcomeMessage', result.message);
            location.href = '/dashboard.html';
        });
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = formValues(registerForm);

        // Quick checks in the browser; the server repeats every check.
        if (!registerForm.checkValidity()) {
            showNotice('Please fill in every field. Usernames use 3–50 letters, numbers, dots, dashes, or underscores; passwords need at least 8 characters.', true);
            return;
        }
        if (values.password !== values.confirmPassword) {
            showNotice('Passwords do not match.', true);
            return;
        }

        runAction(async () => {
            const result = await apiRequest('/auth/register', { method: 'POST', body: values });
            registerForm.reset();
            $('#notice').className = 'notice';
            $('#notice').innerHTML = `${escapeHTML(result.message)} <a href="/login.html">Go to the login page</a>`;
        });
    });
}
