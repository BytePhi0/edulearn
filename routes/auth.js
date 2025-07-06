/* routes/auth.js ---------------------------------------------------------- */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../config/database');   // pg Pool instance
const { generateOTP, sendOTPEmail } = require('../utils/otp');

const router = express.Router();

/* helper – thin wrapper so we write less boiler‑plate */
const q = (sql, params = []) => db.query(sql, params);

/* ------------------------------------------------------------------ */
/*  GET /auth?role=lecturer|student[&mode=login|register][&success=…] */
/* ------------------------------------------------------------------ */
router.get('/', (req, res) => {
  const role    = req.query.role;
  let   mode    = req.query.mode;
  const success = req.query.success;

  if (!['lecturer', 'student'].includes(role ?? ''))
    return res.status(404).render('404', { title: 'Page Not Found' });

  if (!['login', 'register'].includes(mode ?? '')) mode = 'register';

  const successMsg = {
    registered : 'Registration successful! Please log in.',
    logout     : 'You have been logged out.'
  }[success] ?? null;

  return res.render('auth/auth', {
    title  : 'Authentication',
    role,
    mode,
    error  : null,
    success: successMsg
  });
});

/* ------------------------------------------------------------------ */
/*  POST /auth/register                                                */
/* ------------------------------------------------------------------ */
router.post('/register', async (req, res) => {
  const { email, password, name, department, role } = req.body;

  if (!email || !password || !name || !role ||
      (role === 'lecturer' && !department))
    return res.render('auth/auth',
      { error:'Please fill all required fields.', role, mode:'register' });

  try {
    const { rows: existing } =
      await q('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length)
      return res.render('auth/auth',
        { error:'Email already registered.', role, mode:'register' });

    /* store data in session until OTP verified */
    req.session.tempUser = { email, password, name, department, role };

    const otp = generateOTP();
    await q(
      `INSERT INTO otp_verification
         (email, otp, type, expires_at, is_used)
       VALUES ($1,$2,'register', NOW() + INTERVAL '10 minutes', 0)`,
       [email, otp]
    );
    await sendOTPEmail(email, otp, 'register');

    return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`
                      + `&role=${role}&mode=register`);
  } catch (err) {
    console.error(err);
    return res.render('auth/auth',
      { error:'Registration failed. Try again.', role, mode:'register' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /auth/login                                                   */
/* ------------------------------------------------------------------ */
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role)
    return res.render('auth/auth',
      { error:'Please fill all required fields.', role, mode:'login' });

  try {
    const { rows: users } =
      await q('SELECT * FROM users WHERE email = $1 AND role = $2',
              [email, role]);
    if (!users.length)
      return res.render('auth/auth',
        { error:'Invalid credentials.', role, mode:'login' });

    const user  = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.render('auth/auth',
        { error:'Invalid credentials.', role, mode:'login' });

    req.session.tempUser = {
      id: user.id, email: user.email, role: user.role, name: user.name
    };

    const otp = generateOTP();
    await q(
      `INSERT INTO otp_verification
         (email, otp, type, expires_at, is_used)
       VALUES ($1,$2,'login', NOW() + INTERVAL '10 minutes', 0)`,
      [email, otp]
    );
    await sendOTPEmail(email, otp, 'login');

    return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`
                      + `&role=${role}&mode=login`);
  } catch (err) {
    console.error(err);
    return res.render('auth/auth',
      { error:'Login failed. Try again.', role, mode:'login' });
  }
});

/* ------------------------------------------------------------------ */
/*  GET /auth/verify-otp (form)                                       */
/* ------------------------------------------------------------------ */
router.get('/verify-otp', (req, res) => {
  const { email, role, mode } = req.query;
  if (!email || !role || !mode)
    return res.status(400).send('Bad request');

  return res.render('auth/verify-otp',
    { email, role, mode, error:null });
});

/* ------------------------------------------------------------------ */
/*  POST /auth/verify-otp (form submit)                               */
/* ------------------------------------------------------------------ */
router.post('/verify-otp', async (req, res) => {
  const { email, otp, role, mode } = req.body;
  if (!email || !otp || !role || !mode)
    return res.status(400).send('Bad request');

  try {
    const { rows } = await q(
      `SELECT id FROM otp_verification
        WHERE email=$1 AND otp=$2 AND type=$3
          AND expires_at > NOW() AND is_used = 0`,
      [email, otp, mode]
    );
    if (!rows.length)
      return res.render('auth/verify-otp',
        { email, role, mode, error:'Invalid or expired OTP.' });

    await q('UPDATE otp_verification SET is_used = 1 WHERE id = $1',
            [rows[0].id]);

    /* ---------- Registration flow ---------- */
    if (mode === 'register') {
      const tmp = req.session.tempUser;
      if (!tmp || tmp.email !== email)
        return res.render('auth/auth',
          { error:'Session expired. Please register again.',
            role, mode:'register' });

      const hash = await bcrypt.hash(tmp.password, 10);
      await q(
        `INSERT INTO users (email,name,department,password,role)
         VALUES ($1,$2,$3,$4,$5)`,
        [tmp.email,tmp.name,tmp.department||null,hash,tmp.role]
      );
      delete req.session.tempUser;

      return res.redirect(`/auth?role=${role}&mode=login&success=registered`);
    }

    /* ---------- Login flow ---------- */
    if (mode === 'login') {
      const tmp = req.session.tempUser;
      if (!tmp || tmp.email !== email)
        return res.render('auth/auth',
          { error:'Session expired. Please login again.',
            role, mode:'login' });

      req.session.user = { id:tmp.id, name:tmp.name, role:tmp.role };
      delete req.session.tempUser;

      return res.redirect(
        tmp.role === 'lecturer' ? '/dashboard/lecturer' : '/dashboard/student'
      );
    }

    /* fallback – should never hit */
    return res.redirect('/auth');
  } catch (err) {
    console.error(err);
    return res.render('auth/verify-otp',
      { email, role, mode, error:'Verification failed. Try again.' });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /auth/resend-otp                                             */
/* ------------------------------------------------------------------ */
router.post('/resend-otp', async (req, res) => {
  const { email, role, mode } = req.body;
  try {
    const otp = generateOTP();
    await q(
      `INSERT INTO otp_verification
         (email, otp, type, expires_at, is_used)
       VALUES ($1,$2,$3, NOW() + INTERVAL '10 minutes', 0)`,
      [email, otp, mode]
    );
    await sendOTPEmail(email, otp, mode);
    return res.render('auth/verify-otp',
      { email, role, mode, error:'OTP resent. Check your email.' });
  } catch (err) {
    console.error(err);
    return res.render('auth/verify-otp',
      { email, role, mode, error:'Failed to resend OTP.' });
  }
});

module.exports = router;
