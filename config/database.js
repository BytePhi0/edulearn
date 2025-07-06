// config/database.js
const { Pool } = require('pg');
const format   = require('pg-format');   //  ← new
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 60_000,
});

/* ───────────────────────────────────────────────────────────────
 *  ONE‑LINE ADAPTER
 *  Turns  mysql‑style  pool.execute(sql,[params])  into safe
 *  Postgres queries using pg‑format.  Your existing code keeps
 *  working, Postgres never sees a “?” again.
 * ────────────────────────────────────────────────────────────── */
pool.execute = (sql, params = []) =>
  pool.query(format.withArray(sql.replace(/\?/g, '%L'), params));
/*  %L → pg‑format escapes & quotes value properly               */

pool.connect()
  .then(c => { console.log('✅ Postgres connected'); c.release(); })
  .catch(err => { console.error('❌ DB connection failed:', err.message); process.exit(1); });

module.exports = pool;
