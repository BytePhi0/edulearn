const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/database');
const { generateOTP, sendOTPEmail } = require('../utils/otpGenerator');

class AuthController {
  // Register user – send OTP
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password, role, first_name, last_name, phone } = req.body;

      // Check for existing user
      const [existing] = await db.execute(
        'SELECT id FROM users WHERE email = ? OR username = ?',
        [email, username]
      );
      if (existing.length) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create OTP record
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.execute(
        `INSERT INTO otp_verification
         (email, otp, type, expires_at)
         VALUES (?, ?, 'registration', ?)`,
        [email, otp, expiresAt]
      );
      await sendOTPEmail(email, otp, 'registration');

      // Store hashed user data in session
      req.session.tempUser = {
        username,
        email,
        password: await bcrypt.hash(password, 12),
        role,
        first_name,
        last_name,
        phone
      };

      res.json({
        message: 'OTP sent. Verify to complete registration.',
        email
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Login user – send OTP
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const [users] = await db.execute(
        `SELECT id, password, role FROM users
         WHERE email = ? AND is_active = TRUE`,
        [email]
      );
      if (!users.length) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }
      const user = users[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.execute(
        `INSERT INTO otp_verification
         (email, otp, type, expires_at)
         VALUES (?, ?, 'login', ?)`,
        [email, otp, expiresAt]
      );
      await sendOTPEmail(email, otp, 'login');

      req.session.tempUserId = user.id;
      res.json({
        message: 'OTP sent. Verify to complete login.',
        email
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Verify OTP and finalize registration/login
  async verifyOTP(req, res) {
    try {
      const { email, otp, type } = req.body;
      const [rows] = await db.execute(
        `SELECT id FROM otp_verification
         WHERE email = ? AND otp = ? AND type = ? 
           AND expires_at > NOW() AND is_used = FALSE`,
        [email, otp, type]
      );
      if (!rows.length) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }
      const otpId = rows[0].id;
      await db.execute(`UPDATE otp_verification
                        SET is_used = TRUE
                        WHERE id = ?`, [otpId]);

      if (type === 'registration') {
        const temp = req.session.tempUser;
        if (!temp) {
          return res.status(400).json({ message: 'Registration session expired' });
        }
        const [result] = await db.execute(
          `INSERT INTO users
           (username, email, password, role, first_name, last_name, phone, is_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
          [
            temp.username, temp.email, temp.password,
            temp.role, temp.first_name, temp.last_name,
            temp.phone
          ]
        );
        const userId = result.insertId;
        delete req.session.tempUser;

        const token = jwt.sign(
          { userId, email: temp.email, role: temp.role },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
        );
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 3600 * 1000
        });
        return res.status(201).json({
          message: 'Registration successful',
          user: { id: userId, email: temp.email, role: temp.role }
        });
      }

      if (type === 'login') {
        const userId = req.session.tempUserId;
        if (!userId) {
          return res.status(400).json({ message: 'Login session expired' });
        }
        const [users] = await db.execute(
          `SELECT id, email, role, username, first_name, last_name
           FROM users WHERE id = ?`, [userId]
        );
        delete req.session.tempUserId;
        const user = users[0];

        const token = jwt.sign(
          { userId: user.id, email: user.email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
        );
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 3600 * 1000
        });
        return res.json({
          message: 'Login successful',
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            username: user.username
          }
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Logout – clear cookie & session
  async logout(req, res) {
    try {
      res.clearCookie('token');
      req.session.destroy();
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  // Fetch current user via JWT middleware
  async getCurrentUser(req, res) {
    try {
      const [rows] = await db.execute(
        `SELECT id, username, email, role, first_name, last_name, phone, profile_image
         FROM users WHERE id = ?`,
        [req.user.userId]
      );
      if (!rows.length) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

module.exports = new AuthController();
