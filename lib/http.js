// Small helpers that give every API response the same JSON shape:
//   { success: true|false, message: "...", data: ... }

// Create an error that the central error handler (server.js) sends with this status code.
function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

// Send a successful JSON response. `data` is optional.
function sendSuccess(res, message, data, status = 200) {
    const body = { success: true, message };
    if (data !== undefined) {
        body.data = data;
    }
    res.status(status).json(body);
}

module.exports = { httpError, sendSuccess };
