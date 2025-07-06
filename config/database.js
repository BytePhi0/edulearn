// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

/* -------------------------------------------------------------
 *  Create a connection pool (very similar to mysql2)
 * ----------------------------------------------------------- */
const pool = new Pool({
  host:     process.env.DB_HOST,      // shuttle.proxy.rlwy.net
  user:     process.env.DB_USER,      // postgres
  password: process.env.DB_PASSWORD,  // oPWxBK...Wf
  database: process.env.DB_NAME,      // railway
  port:     process.env.DB_PORT,      // 19751

  // Railway’s public endpoint requires SSL
  ssl: { rejectUnauthorized: false },

  // pg-specific pool settings
  max:            10,     // same as connectionLimit
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

/* -------------------------------------------------------------
 *  Simple connectivity check
 * ----------------------------------------------------------- */
pool.connect()
  .then(client => {
    console.log('✅ Postgres connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

/* -------------------------------------------------------------
 *  Export the pool – pg queries already return Promises
 * ----------------------------------------------------------- */
module.exports = pool;
