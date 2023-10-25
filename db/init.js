const mysql = require("mysql2/promise");

require("../lib/getenv")();

const conn = mysql.createConnection({
    host: process.env.HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME
});



module.exports = conn;