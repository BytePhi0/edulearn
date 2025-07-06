// config/database.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:      { rejectUnauthorized: false }, // required for Railway public endpoint
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 60_000
});

/* ------------------------------------------------------------- */
/*  mysql2‑style execute() wrapper for pg                        */
/*  ‑ Converts ? placeholders → $1, $2, …                        */
/* ------------------------------------------------------------- */
pool.execute = (sql, params = []) => {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  return pool.query(pgSql, params);
};

/* ------------------------------------------------------------- */
/*  Simple connectivity check                                    */
/* ------------------------------------------------------------- */
pool.connect()
  .then(c => { console.log('✅ Postgres connected'); c.release(); })
  .catch(err => {
    console.error('❌ DB connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
