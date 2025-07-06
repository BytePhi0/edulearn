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
function buildHtml({ appName, otp, type }) {
  const brand = '#21808d'; // School color
  const logoUrl = process.env.SCHOOL_LOGO_URL || 'https://your-school.edu/logo.png'; // Replace with your logo
  const schoolName = process.env.SCHOOL_NAME || 'University of Example';
  const schoolAddress = process.env.SCHOOL_ADDRESS || 'Ibadan, Oyo, Nigeria';
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
        <style>
          body{font-family:"Poppins",Arial,sans-serif;margin:0;padding:0;background:#f7f9fa;color:#333}
          .wrapper{max-width:560px;margin:0 auto;padding:40px 24px}
          .card{background:#fff;border-radius:8px;padding:32px 24px;box-shadow:0 6px 18px rgba(0,0,0,.06)}
          h1{color:${brand};margin:0 0 16px;font-size:22px;font-weight:600}
          p{margin:0 0 24px;line-height:1.55}
          .otp{display:inline-block;font-size:28px;letter-spacing:6px;font-weight:700;color:${brand};padding:12px 24px;border:2px dashed ${brand};border-radius:6px;background:rgba(33,128,141,.05)}
          .footer{margin-top:32px;font-size:12px;color:#777;text-align:center}
          .logo{display:block;margin:0 auto 24px;width:80px;height:auto}
          @media(max-width:480px){.wrapper{padding:24px 16px}.card{padding:24px 18px}}
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="card">
            <img src="${logoUrl}" alt="${schoolName} Logo" class="logo" />
            <h1>${title}</h1>
            <p>Dear Student,</p>
            <p>${purpose}</p>
            <div class="otp">${otp}</div>
            <p style="margin-top:24px">This code will expire in 10 minutes for your security.</p>
            <p>If you didn’t request this, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${schoolName}.<br>
            ${schoolAddress}.<br>
            All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;
}

/* ------------------------------------------------------------ */
/* 4. sendOTPEmail                                               */
/* ------------------------------------------------------------ */
export async function sendOTPEmail(email, otp, type = 'login') {
  const appName = process.env.APP_NAME || 'EduConnect';
  const schoolName = process.env.SCHOOL_NAME || 'University of Example';
  const subject =
    type === 'register'
      ? `${schoolName} • Confirm your registration`
      : `${schoolName} • Your one‑time password`;

  const text = [
    `Dear Student,`,
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
    html: buildHtml({ appName, otp, type })
  });
}
