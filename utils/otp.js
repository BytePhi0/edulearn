// utils/otp.js
import nodemailer from 'nodemailer';

/* ------------------------------------------------------------ */
/* 1. One‑liner OTP generator (6 digits, zero‑padded)            */
/* ------------------------------------------------------------ */
export function generateOTP() {
  return ('' + Math.floor(Math.random() * 999_999)).padStart(6, '0');
}

/* ------------------------------------------------------------ */
/* 2. Nodemailer transport (use ENV vars!)                       */
/* ------------------------------------------------------------ */
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/* ------------------------------------------------------------ */
/* 3. HTML template helper                                       */
/* ------------------------------------------------------------ */
function buildHtml({ appName, otp, type, role, recipientName }) {
  const brand = '#21808d'; // Primary color
  const accent = '#e6f3f6'; // Accent background
  const logoUrl = process.env.SCHOOL_LOGO_URL || 'https://your-school.edu/logo.png';
  const schoolName = process.env.SCHOOL_NAME || 'University of Example';
  const schoolAddress = process.env.SCHOOL_ADDRESS || 'Ibadan, Oyo, Nigeria';
  const year = new Date().getFullYear();

  // Role-based greeting
  let roleDisplay = '';
  if (role) {
    const roleMap = {
      student: 'Student',
      lecturer: 'Lecturer',
      admin: 'Administrator'
    };
    roleDisplay = roleMap[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1);
  }

  const greeting = recipientName
    ? `Dear ${recipientName}${roleDisplay ? ` (${roleDisplay})` : ''},`
    : `Dear ${roleDisplay || 'User'},`;

  // Subject and purpose
  const title   = type === 'register' ? 'Complete Your Registration' : 'Your One‑Time Password';
  const purpose = type === 'register'
    ? `Use this code to finish creating your ${appName} account.`
    : `Use this code to sign in to your ${appName} account.`;

  return /* html */ `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body {
            font-family: 'Poppins', Arial, sans-serif;
            margin: 0; padding: 0;
            background: #f7f9fa;
            color: #222;
          }
          .wrapper {
            max-width: 540px;
            margin: 0 auto;
            padding: 40px 18px;
          }
          .card {
            background: #fff;
            border-radius: 12px;
            padding: 36px 28px 28px 28px;
            box-shadow: 0 6px 24px rgba(33,128,141,0.08);
            border-top: 6px solid ${brand};
          }
          .logo {
            display: block;
            margin: 0 auto 18px;
            width: 80px;
            height: auto;
          }
          h1 {
            color: ${brand};
            margin: 0 0 12px;
            font-size: 1.5em;
            font-weight: 700;
            letter-spacing: 0.01em;
            text-align: center;
          }
          p {
            margin: 0 0 18px;
            line-height: 1.6;
            font-size: 1.04em;
          }
          .otp {
            display: inline-block;
            font-size: 2.1em;
            letter-spacing: 8px;
            font-weight: 700;
            color: ${brand};
            padding: 14px 32px;
            border: 2px dashed ${brand};
            border-radius: 10px;
            background: ${accent};
            margin: 18px 0 18px 0;
            text-align: center;
            user-select: all;
          }
          .footer {
            margin-top: 38px;
            font-size: 13px;
            color: #888;
            text-align: center;
            line-height: 1.6;
          }
          .school-info {
            color: #555;
            font-size: 14px;
            margin-top: 8px;
          }
          @media (max-width: 600px) {
            .wrapper { padding: 18px 3vw; }
            .card { padding: 18px 7vw; }
            .logo { width: 60px; }
            .otp { font-size: 1.4em; padding: 10px 14px; }
          }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="card">
            <img src="${logoUrl}" alt="${schoolName} Logo" class="logo" />
            <h1>${title}</h1>
            <p>${greeting}</p>
            <p>${purpose}</p>
            <div class="otp">${otp}</div>
            <p style="margin-top:22px; color:#555;">This code will expire in <strong>10 minutes</strong> for your security.</p>
            <p>If you didn’t request this, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <div class="school-info">
              &copy; ${year} ${schoolName}.<br>
              ${schoolAddress}
            </div>
            <div>
              Powered by <b>${appName}</b>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/* ------------------------------------------------------------ */
/* 4. sendOTPEmail - with role and recipientName support         */
/* ------------------------------------------------------------ */
export async function sendOTPEmail(email, otp, type = 'login', role = '', recipientName = '') {
  const appName = process.env.APP_NAME || 'EduConnect';
  const schoolName = process.env.SCHOOL_NAME || 'University of Example';
  const subject =
    type === 'register'
      ? `${schoolName} • Confirm your registration`
      : `${schoolName} • Your one‑time password`;

  const text = [
    recipientName
      ? `Dear ${recipientName}${role ? ` (${role.charAt(0).toUpperCase() + role.slice(1)})` : ''},`
      : `Dear ${role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User'},`,
    '',
    type === 'register'
      ? `Use the code below to finish creating your ${appName} account.`
      : `Use the code below to sign in to your ${appName} account.`,
    '',
    `OTP: ${otp}`,
    '',
    'The code expires in 10 minutes.',
    '',
    'If you did not request this, you can ignore this email.',
    '',
    `— The ${schoolName} Team`
  ].join('\n');

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `"${schoolName}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text,
    html: buildHtml({ appName, otp, type, role, recipientName })
  });
}
