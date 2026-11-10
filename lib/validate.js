// Server-side validation helpers. Each one returns a clean value or throws a
// 400 error with a message that the frontend shows to the user.
const { httpError } = require('./http');

function requireText(value, fieldName, maxLength = 255) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw httpError(400, `${fieldName} is required.`);
    }
    const text = value.trim();
    if (text.length > maxLength) {
        throw httpError(400, `${fieldName} must be ${maxLength} characters or fewer.`);
    }
    return text;
}

function requireInteger(value, fieldName, minimum = 1) {
    const number = Number(value);
    const validType = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
    if (!validType || !Number.isSafeInteger(number) || number < minimum) {
        throw httpError(400, `${fieldName} must be a whole number of at least ${minimum}.`);
    }
    return number;
}

// Route parameters such as /api/equipment/:id
function requireId(value) {
    return requireInteger(value, 'ID');
}

function requireChoice(value, allowedValues, fieldName) {
    if (!allowedValues.includes(value)) {
        throw httpError(400, `${fieldName} must be one of: ${allowedValues.join(', ')}.`);
    }
    return value;
}

function requireEmail(value) {
    const email = requireText(value, 'Email', 150).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, 'Enter a valid email address.');
    }
    return email;
}

// A real calendar date in YYYY-MM-DD format (rejects values such as 2026-02-30).
function requireDate(value, fieldName = 'Date') {
    const looksLikeDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!looksLikeDate || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        throw httpError(400, `${fieldName} must be a valid date.`);
    }
    return value;
}

// A time in HH:MM or HH:MM:SS format, returned as HH:MM:SS.
function requireTime(value, fieldName) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) {
        throw httpError(400, `${fieldName} must be a valid time.`);
    }
    return value.length === 5 ? `${value}:00` : value;
}

// Today's date on the server, as YYYY-MM-DD in local time.
function today() {
    return new Date().toLocaleDateString('en-CA');
}

module.exports = { requireText, requireInteger, requireId, requireChoice, requireEmail, requireDate, requireTime, today };
