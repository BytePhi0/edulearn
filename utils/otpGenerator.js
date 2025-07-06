const nodemailer = require('nodemailer');
const randomstring = require('randomstring');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Generate OTP
function generateOTP() {
    return randomstring.generate({
        length: 6,
        charset: 'numeric'
    });
}

// Send OTP email
async function sendOTPEmail(email, otp, type) {
    const subject = type === 'registration' ? 'Complete Your Registration' : 'Verify Your Login';
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: white; padding: 30px; border: 1px solid #e2e8f0; }
                .otp-box { background: #f8fafc; border: 2px solid #2563eb; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
                .otp-code { font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 5px; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; border-top: none; }
                .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎓 E-Learning Platform</h1>
                    <p>${subject}</p>
                </div>
                <div class="content">
                    <h2>Hello!</h2>
                    <p>We received a request to ${type === 'registration' ? 'complete your registration' : 'verify your login'} for your E-Learning Platform account.</p>
                    
                    <div class="otp-box">
                        <p><strong>Your verification code is:</strong></p>
                        <div class="otp-code">${otp}</div>
                    </div>
                    
                    <p><strong>This code will expire in 10 minutes.</strong></p>
                    
                    <p>If you didn't request this, please ignore this email. Your account remains secure.</p>
                    
                    <p>Best regards,<br>The E-Learning Platform Team</p>
                </div>
                <div class="footer">
                    <p>© 2024 E-Learning Platform. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: subject,
        html: html
    });
}

module.exports = {
    generateOTP,
    sendOTPEmail
};
