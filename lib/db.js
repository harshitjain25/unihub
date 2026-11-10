// MySQL connection pool shared by every route.
// Connection settings come from .env, so no password is written in the code.
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'unihub',
    connectionLimit: 10,
    dateStrings: true // return DATE/TIME columns as plain strings such as "2026-11-09"
});

// Run several queries as one all-or-nothing transaction.
// `work` receives a dedicated connection; if it throws, every change is rolled back.
async function transaction(work) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

pool.transaction = transaction;
module.exports = pool;
