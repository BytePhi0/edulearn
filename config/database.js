// config/database.js  (or whatever the file is called)
const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT,

  /* --- valid pool settings --- */
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,

  /* --- valid timeout option --- */
  connectTimeout: 60_000   // 60 s  (was “acquireTimeout / timeout”)
});

/* ------------------------------------------------------------------ */
/*  Simple connectivity check                                         */
/* ------------------------------------------------------------------ */
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);       // stop the app – adjust if you prefer retry logic
  } else {
    console.log('✅ Database connected successfully');
    connection.release();
  }
});

/* Export a promise‑wrapped pool so you can use async/await elsewhere */
module.exports = pool.promise();
