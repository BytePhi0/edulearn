/* routes/auth.js */
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const { generateOTP, sendOTPEmail } = require('../utils/otp');

const router = express.Router();

/* --------------------------------------------------------------
 *  GET /auth?role=lecturer | /auth?role=student
 * ------------------------------------------------------------ */
router.get('/', (req, res) => {
  const role    = req.query.role;
  let   mode    = req.query.mode;
  const success = req.query.success;

  if (!role || !['lecturer', 'student'].includes(role))
    return res.status(404).render('404', { title: 'Page Not Found' });

  if (!mode || !['login', 'register'].includes(mode)) mode = 'register';

  const successMsg =
    success === 'registered' ? 'Registration successful! Please log in.'
    : success === 'logout'   ? 'You have been logged out.'
    : null;

  res.render('auth/auth', {
    title: 'Authentication',
    role,
    mode,
    error: null,
    success: successMsg
  });
});

/* --------------------------------------------------------------
 *  POST /auth/register
 * ------------------------------------------------------------ */
router.post('/register', async (req, res) => {
  const { email, password, name, department, role } = req.body;
  if (!email || !password || !name || !role || (role === 'lecturer' && !department))
    return res.render('auth/auth', { error: 'Please fill all required fields.', role, mode: 'register' });

  try {
    const { rows: existing } = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length)
      return res.render('auth/auth', { error: 'Email already registered.', role, mode: 'register' });

    req.session.tempUser = { email, password, name, department, role };

    const otp = generateOTP();
    await db.execute(
      `INSERT INTO otp_verification (email, otp, type, expires_at, is_used)
       VALUES (?, ?, ?, NOW() + INTERVAL '10 minutes', 0)`,
      [email, otp, 'register']
    );
    await sendOTPEmail(email, otp, 'register');
    res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}&role=${role}&mode=register`);
  } catch (err) {
    console.error(err);
    res.render('auth/auth', { error: 'Registration failed. Try again.', role, mode: 'register' });
  }
});

/* --------------------------------------------------------------
 *  POST /auth/login
 * ------------------------------------------------------------ */
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.render('auth/auth', { error: 'Please fill all required fields.', role, mode: 'login' });

  try {
    const { rows: users } = await db.execute('SELECT * FROM users WHERE email = ? AND role = ?', [email, role]);
    if (!users.length)
      return res.render('auth/auth', { error: 'Invalid credentials.', role, mode: 'login' });

    const user  = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.render('auth/auth', { error: 'Invalid credentials.', role, mode: 'login' });

    req.session.tempUser = { id: user.id, email: user.email, role: user.role, name: user.name };

    const otp = generateOTP();
    await db.execute(
      `INSERT INTO otp_verification (email, otp, type, expires_at, is_used)
       VALUES (?, ?, ?, NOW() + INTERVAL '10 minutes', 0)`,
      [email, otp, 'login']
    );
    await sendOTPEmail(email, otp, 'login');
    res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}&role=${role}&mode=login`);
  } catch (err) {
    console.error(err);
    res.render('auth/auth', { error: 'Login failed. Try again.', role, mode: 'login' });
  }
});

/* --------------------------------------------------------------
 *  GET /auth/verify-otp
 * ------------------------------------------------------------ */
router.get('/verify-otp', (req, res) => {
  const { email, role, mode } = req.query;
  if (!email || !role || !mode) return res.status(400).send('Bad request');
  res.render('auth/verify-otp', { email, role, mode, error: null });
});

/* --------------------------------------------------------------
 *  POST /auth/verify-otp
 * ------------------------------------------------------------ */
router.post('/verify-otp', async (req, res) => {
  const { email, otp, role, mode } = req.body;
  if (!email || !otp || !role || !mode) return res.status(400).send('Bad request');

  try {
    const { rows } = await db.execute(
      'SELECT * FROM otp_verification WHERE email = ? AND otp = ? AND type = ? AND expires_at > NOW() AND is_used = 0',
      [email, otp, mode]
    );
    if (!rows.length)
      return res.render('auth/verify-otp', { email, role, mode, error: 'Invalid or expired OTP.' });

    await db.execute('UPDATE otp_verification SET is_used = 1 WHERE id = ?', [rows[0].id]);

    if (mode === 'register') {
      const temp = req.session.tempUser;
      if (!temp || temp.email !== email)
        return res.render('auth/auth', { error: 'Session expired. Please register again.', role, mode: 'register' });

      const hashed = await bcrypt.hash(temp.password, 10);
      await db.execute(
        'INSERT INTO users (email, name, department, password, role) VALUES (?, ?, ?, ?, ?)',
        [temp.email, temp.name, temp.department || null, hashed, temp.role]
      );
      delete req.session.tempUser;
      return res.redirect(`/auth?role=${role}&mode=login&success=registered`);
    }

    if (mode === 'login') {
      const temp = req.session.tempUser;
      if (!temp || temp.email !== email)
        return res.render('auth/auth', { error: 'Session expired. Please login again.', role, mode: 'login' });

      req.session.user = { id: temp.id, name: temp.name, role: temp.role };
      delete req.session.tempUser;
      return res.redirect(temp.role === 'lecturer' ? '/dashboard/lecturer' : '/dashboard/student');
    }
  } catch (err) {
    console.error(err);
    res.render('auth/verify-otp', { email, role, mode, error: 'Verification failed. Try again.' });
  }
});

/* --------------------------------------------------------------
 *  POST /auth/resend-otp
 * ------------------------------------------------------------ */
router.post('/resend-otp', async (req, res) => {
  const { email, role, mode } = req.body;
  try {
    const otp = generateOTP();
    await db.execute(
      `INSERT INTO otp_verification (email, otp, type, expires_at, is_used)
       VALUES (?, ?, ?, NOW() + INTERVAL '10 minutes', 0)`,
      [email, otp, mode]
    );
    await sendOTPEmail(email, otp, mode);
    res.render('auth/verify-otp', { email, role, mode, error: 'OTP resent. Check your email.' });
  } catch (err) {
    console.error(err);
    res.render('auth/verify-otp', { email, role, mode, error: 'Failed to resend OTP.' });
  }
});

module.exports = router;
