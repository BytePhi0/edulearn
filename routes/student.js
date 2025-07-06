const express = require('express');
const db = require('../config/database');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

const router = express.Router();

// Apply authentication and student role check
router.use(auth);
router.use(roleAuth('student'));

// Student dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const studentId = req.user.userId;

        // Get enrolled courses
        const [enrolledCourses] = await db.execute(`
            SELECT COUNT(*) as total_courses 
            FROM course_enrollments 
            WHERE student_id = ? AND status = "active"
        `, [studentId]);

        // Get upcoming classes
        const [upcomingClasses] = await db.execute(`
            SELECT lc.*, c.title as course_title, c.course_code,
                   CONCAT(u.first_name, ' ', u.last_name) as instructor_name
            FROM live_classes lc 
            JOIN courses c ON lc.course_id = c.id 
            JOIN course_enrollments ce ON c.id = ce.course_id 
            JOIN users u ON c.lecturer_id = u.id
            WHERE ce.student_id = ? AND lc.scheduled_date > NOW() AND lc.status IN ('scheduled', 'live')
            ORDER BY lc.scheduled_date ASC 
            LIMIT 5
        `, [studentId]);

        // Get recent classes attended
        const [recentClasses] = await db.execute(`
            SELECT lc.*, c.title as course_title, ca.joined_at, ca.duration_minutes
            FROM live_classes lc 
            JOIN courses c ON lc.course_id = c.id 
            JOIN class_attendance ca ON lc.id = ca.class_id 
            WHERE ca.student_id = ? 
            ORDER BY ca.joined_at DESC 
            LIMIT 5
        `, [studentId]);

        // Get course list with progress
        const [courseList] = await db.execute(`
            SELECT c.*, ce.enrollment_date, ce.status as enrollment_status,
                   CONCAT(u.first_name, ' ', u.last_name) as instructor_name,
                   COUNT(lc.id) as total_classes,
                   COUNT(ca.id) as attended_classes
            FROM courses c 
            JOIN course_enrollments ce ON c.id = ce.course_id 
            JOIN users u ON c.lecturer_id = u.id
            LEFT JOIN live_classes lc ON c.id = lc.course_id 
            LEFT JOIN class_attendance ca ON lc.id = ca.class_id AND ca.student_id = ce.student_id
            WHERE ce.student_id = ? AND ce.status = "active"
            GROUP BY c.id, ce.id, u.id
            ORDER BY ce.enrollment_date DESC
        `, [studentId]);

        res.render('dashboard/student', {
            title: 'Student Dashboard',
            user: req.user,
            stats: {
                enrolledCourses: enrolledCourses[0].total_courses,
                upcomingClasses: upcomingClasses.length,
                recentClasses: recentClasses.length
            },
            upcomingClasses: upcomingClasses.map(cls => ({
                ...cls,
                scheduled_date: new Date(cls.scheduled_date).toLocaleString()
            })),
            recentClasses: recentClasses.map(cls => ({
                ...cls,
                joined_at: new Date(cls.joined_at).toLocaleString()
            })),
            courses: courseList.map(course => ({
                ...course,
                progress: course.total_classes > 0 ? Math.round((course.attended_classes / course.total_classes) * 100) : 0
            }))
        });
    } catch (error) {
        console.error('Student dashboard error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load dashboard' });
    }
});

// Browse available courses
router.get('/courses/browse', async (req, res) => {
    try {
        const studentId = req.user.userId;
        const { search, semester, credits } = req.query;

        let query = `
            SELECT c.*, 
                   CONCAT(u.first_name, ' ', u.last_name) as lecturer_name,
                   COUNT(ce.id) as enrolled_students,
                   MAX(CASE WHEN ce.student_id = ? THEN 1 ELSE 0 END) as is_enrolled
            FROM courses c 
            JOIN users u ON c.lecturer_id = u.id 
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
            WHERE c.status = 'active'
        `;
        
        const params = [studentId];

        if (search) {
            query += ` AND (c.title LIKE ? OR c.description LIKE ? OR c.course_code LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (semester) {
            query += ` AND c.semester = ?`;
            params.push(semester);
        }

        if (credits) {
            query += ` AND c.credits = ?`;
            params.push(credits);
        }

        query += ` GROUP BY c.id, u.id ORDER BY c.created_at DESC`;

        const [availableCourses] = await db.execute(query, params);

        res.render('student/courses/browse', {
            title: 'Browse Courses',
            user: req.user,
            availableCourses: availableCourses
        });
    } catch (error) {
        console.error('Browse courses error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load courses' });
    }
});

// Enroll in course
router.post('/courses/:id/enroll', async (req, res) => {
    try {
        const courseId = req.params.id;
        const studentId = req.user.userId;

        // Check if already enrolled
        const [existing] = await db.execute(
            'SELECT id FROM course_enrollments WHERE student_id = ? AND course_id = ?',
            [studentId, courseId]
        );

        if (existing.length > 0) {
            return res.json({ success: false, message: 'Already enrolled in this course' });
        }

        // Enroll student
        await db.execute(
            'INSERT INTO course_enrollments (student_id, course_id) VALUES (?, ?)',
            [studentId, courseId]
        );

        res.json({ success: true, message: 'Successfully enrolled in course' });
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({ success: false, message: 'Failed to enroll in course' });
    }
});

// View enrolled courses
router.get('/courses', async (req, res) => {
    try {
        const studentId = req.user.userId;

        const [courses] = await db.execute(`
            SELECT c.*, ce.enrollment_date, ce.status as enrollment_status,
                   CONCAT(u.first_name, ' ', u.last_name) as instructor_name,
                   COUNT(lc.id) as total_classes,
                   COUNT(ca.id) as attended_classes
            FROM courses c 
            JOIN course_enrollments ce ON c.id = ce.course_id 
            JOIN users u ON c.lecturer_id = u.id
            LEFT JOIN live_classes lc ON c.id = lc.course_id 
            LEFT JOIN class_attendance ca ON lc.id = ca.class_id AND ca.student_id = ce.student_id
            WHERE ce.student_id = ? AND ce.status = "active"
            GROUP BY c.id, ce.id, u.id
            ORDER BY ce.enrollment_date DESC
        `, [studentId]);

        res.render('student/courses/index', {
            title: 'My Courses',
            user: req.user,
            courses: courses.map(course => ({
                ...course,
                progress: course.total_classes > 0 ? Math.round((course.attended_classes / course.total_classes) * 100) : 0
            }))
        });
    } catch (error) {
        console.error('Student courses error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load courses' });
    }
});

// View course materials
router.get('/courses/:id/materials', async (req, res) => {
    try {
        const courseId = req.params.id;
        const studentId = req.user.userId;

        // Check enrollment
        const [enrollment] = await db.execute(
            'SELECT id FROM course_enrollments WHERE student_id = ? AND course_id = ? AND status = "active"',
            [studentId, courseId]
        );

        if (enrollment.length === 0) {
            return res.status(403).render('error', { title: 'Access Denied', message: 'You are not enrolled in this course' });
        }

        // Get course and materials
        const [course] = await db.execute('SELECT * FROM courses WHERE id = ?', [courseId]);
        const [materials] = await db.execute(
            'SELECT * FROM course_materials WHERE course_id = ? AND is_public = TRUE ORDER BY upload_date DESC',
            [courseId]
        );

        res.render('student/courses/materials', {
            title: 'Course Materials',
            user: req.user,
            course: course[0],
            materials: materials
        });
    } catch (error) {
        console.error('Course materials error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load materials' });
    }
});

module.exports = router;
