const express = require('express');
const auth = require('../middleware/auth');
const db = require('../config/database');
const notificationService = require('../utils/notificationService');

const router = express.Router();

// Apply authentication to all API routes
router.use(auth);

// Get dashboard stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;

        if (userRole === 'lecturer') {
            const [courses] = await db.execute(
                'SELECT COUNT(*) as total FROM courses WHERE lecturer_id = ? AND status = "active"',
                [userId]
            );

            const [students] = await db.execute(`
                SELECT COUNT(DISTINCT ce.student_id) as total 
                FROM course_enrollments ce 
                JOIN courses c ON ce.course_id = c.id 
                WHERE c.lecturer_id = ? AND ce.status = "active"
            `, [userId]);

            const [classes] = await db.execute(`
                SELECT COUNT(*) as total 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? AND lc.scheduled_date > NOW()
            `, [userId]);

            res.json({
                totalCourses: courses[0].total,
                totalStudents: students[0].total,
                upcomingClasses: classes[0].total
            });
        } else {
            const [courses] = await db.execute(
                'SELECT COUNT(*) as total FROM course_enrollments WHERE student_id = ? AND status = "active"',
                [userId]
            );

            const [classes] = await db.execute(`
                SELECT COUNT(*) as total 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                JOIN course_enrollments ce ON c.id = ce.course_id 
                WHERE ce.student_id = ? AND lc.scheduled_date > NOW()
            `, [userId]);

            res.json({
                enrolledCourses: courses[0].total,
                upcomingClasses: classes[0].total
            });
        }
    } catch (error) {
        console.error('API stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get user notifications
router.get('/notifications', async (req, res) => {
    try {
        const userId = req.user.userId;
        const notifications = await notificationService.getUserNotifications(userId);
        res.json(notifications);
    } catch (error) {
        console.error('API notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
router.post('/notifications/:id/read', async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.user.userId;
        
        await notificationService.markAsRead(notificationId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error('API mark notification read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Search courses
router.get('/courses/search', async (req, res) => {
    try {
        const { q, role } = req.query;
        const userId = req.user.userId;
        
        let query = `
            SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as lecturer_name
            FROM courses c 
            JOIN users u ON c.lecturer_id = u.id 
            WHERE c.status = 'active'
        `;
        
        const params = [];
        
        if (q) {
            query += ` AND (c.title LIKE ? OR c.description LIKE ? OR c.course_code LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        
        if (role === 'student') {
            // Exclude courses the student is already enrolled in
            query += ` AND c.id NOT IN (
                SELECT course_id FROM course_enrollments 
                WHERE student_id = ? AND status = 'active'
            )`;
            params.push(userId);
        } else if (role === 'lecturer') {
            // Only show lecturer's own courses
            query += ` AND c.lecturer_id = ?`;
            params.push(userId);
        }
        
        query += ` ORDER BY c.created_at DESC LIMIT 20`;
        
        const [courses] = await db.execute(query, params);
        res.json(courses);
    } catch (error) {
        console.error('API course search error:', error);
        res.status(500).json({ error: 'Failed to search courses' });
    }
});

// Get upcoming classes
router.get('/classes/upcoming', async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        
        let query, params;
        
        if (userRole === 'lecturer') {
            query = `
                SELECT lc.*, c.title as course_title
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? AND lc.scheduled_date > NOW() AND lc.status = 'scheduled'
                ORDER BY lc.scheduled_date ASC 
                LIMIT 5
            `;
            params = [userId];
        } else {
            query = `
                SELECT lc.*, c.title as course_title
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                JOIN course_enrollments ce ON c.id = ce.course_id 
                WHERE ce.student_id = ? AND lc.scheduled_date > NOW() AND lc.status IN ('scheduled', 'live')
                ORDER BY lc.scheduled_date ASC 
                LIMIT 5
            `;
            params = [userId];
        }
        
        const [classes] = await db.execute(query, params);
        res.json(classes);
    } catch (error) {
        console.error('API upcoming classes error:', error);
        res.status(500).json({ error: 'Failed to fetch upcoming classes' });
    }
});

// Join class (for students)
router.post('/classes/:id/join', async (req, res) => {
    try {
        const classId = req.params.id;
        const studentId = req.user.userId;
        
        // Verify student is enrolled in the course
        const [enrollment] = await db.execute(`
            SELECT ce.id 
            FROM course_enrollments ce
            JOIN courses c ON ce.course_id = c.id
            JOIN live_classes lc ON c.id = lc.course_id
            WHERE ce.student_id = ? AND lc.id = ? AND ce.status = 'active'
        `, [studentId, classId]);
        
        if (enrollment.length === 0) {
            return res.status(403).json({ error: 'Not enrolled in this course' });
        }
        
        // Record attendance
        await db.execute(`
            INSERT INTO class_attendance (class_id, student_id, joined_at) 
            VALUES (?, ?, NOW()) 
            ON DUPLICATE KEY UPDATE joined_at = NOW()
        `, [classId, studentId]);
        
        // Get meeting link
        const [classes] = await db.execute(
            'SELECT meeting_link FROM live_classes WHERE id = ?',
            [classId]
        );
        
        res.json({ 
            success: true, 
            meetingLink: classes[0].meeting_link 
        });
    } catch (error) {
        console.error('API join class error:', error);
        res.status(500).json({ error: 'Failed to join class' });
    }
});

module.exports = router;
