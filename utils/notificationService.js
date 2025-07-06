const db = require('../config/database');
const nodemailer = require('nodemailer');

class NotificationService {
    constructor() {
        this.transporter = nodemailer.createTransporter({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    }

    // Create notification in database
    async createNotification(userId, title, message, type = 'info', actionUrl = null) {
        try {
            const [result] = await db.execute(`
                INSERT INTO notifications (user_id, title, message, type, action_url, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `, [userId, title, message, type, actionUrl]);
            
            return result.insertId;
        } catch (error) {
            console.error('Create notification error:', error);
            throw error;
        }
    }

    // Send email notification
    async sendEmailNotification(email, subject, htmlContent) {
        try {
            await this.transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: email,
                subject: subject,
                html: htmlContent
            });
        } catch (error) {
            console.error('Send email notification error:', error);
            throw error;
        }
    }

    // Notify students about new class
    async notifyNewClass(classId) {
        try {
            // Get class and course details
            const [classes] = await db.execute(`
                SELECT lc.*, c.title as course_title, c.id as course_id
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE lc.id = ?
            `, [classId]);

            if (classes.length === 0) return;

            const classData = classes[0];

            // Get enrolled students
            const [students] = await db.execute(`
                SELECT u.id, u.email, u.first_name, u.last_name
                FROM users u 
                JOIN course_enrollments ce ON u.id = ce.student_id 
                WHERE ce.course_id = ? AND ce.status = 'active'
            `, [classData.course_id]);

            // Create notifications and send emails
            for (const student of students) {
                // Create in-app notification
                await this.createNotification(
                    student.id,
                    'New Live Class Scheduled',
                    `A new live class "${classData.title}" has been scheduled for ${classData.course_title}`,
                    'info',
                    `/classes/${classId}`
                );

                // Send email notification
                const emailHtml = this.generateClassNotificationEmail(student, classData);
                await this.sendEmailNotification(
                    student.email,
                    `New Live Class: ${classData.title}`,
                    emailHtml
                );
            }
        } catch (error) {
            console.error('Notify new class error:', error);
        }
    }

    // Notify about assignment due date
    async notifyAssignmentDue(assignmentId, daysBefore = 3) {
        try {
            // Implementation for assignment notifications
            // This would be expanded when assignment system is implemented
        } catch (error) {
            console.error('Notify assignment due error:', error);
        }
    }

    // Generate email template for class notification
    generateClassNotificationEmail(student, classData) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: white; padding: 30px; border: 1px solid #e2e8f0; }
                .class-details { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .footer { background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; border-top: none; }
                .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎓 New Live Class Scheduled</h1>
                </div>
                <div class="content">
                    <h2>Hello ${student.first_name}!</h2>
                    <p>A new live class has been scheduled for one of your courses.</p>
                    
                    <div class="class-details">
                        <h3><strong>Class Details:</strong></h3>
                        <p><strong>Title:</strong> ${classData.title}</p>
                        <p><strong>Course:</strong> ${classData.course_title}</p>
                        <p><strong>Date & Time:</strong> ${new Date(classData.scheduled_date).toLocaleString()}</p>
                        <p><strong>Duration:</strong> ${classData.duration_minutes} minutes</p>
                        ${classData.description ? `<p><strong>Description:</strong> ${classData.description}</p>` : ''}
                    </div>
                    
                    <p>Make sure to join the class on time. You can access the class from your dashboard.</p>
                    
                    <p style="text-align: center;">
                        <a href="${process.env.APP_URL}/dashboard" class="btn">Go to Dashboard</a>
                    </p>
                </div>
                <div class="footer">
                    <p>© 2024 E-Learning Platform. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // Get user notifications
    async getUserNotifications(userId, limit = 10) {
        try {
            const [notifications] = await db.execute(`
                SELECT * FROM notifications 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `, [userId, limit]);

            return notifications;
        } catch (error) {
            console.error('Get user notifications error:', error);
            return [];
        }
    }

    // Mark notification as read
    async markAsRead(notificationId, userId) {
        try {
            await db.execute(`
                UPDATE notifications 
                SET is_read = TRUE, read_at = NOW() 
                WHERE id = ? AND user_id = ?
            `, [notificationId, userId]);
        } catch (error) {
            console.error('Mark notification as read error:', error);
        }
    }
}

module.exports = new NotificationService();
