const db = require('../config/database');
const moment = require('moment');

class DashboardController {
    // Lecturer Dashboard
    async lecturerDashboard(req, res) {
        try {
            const lecturerId = req.user.userId;

            // Get lecturer's courses
            const [courses] = await db.execute(
                'SELECT COUNT(*) as total_courses FROM courses WHERE lecturer_id = ? AND status = "active"',
                [lecturerId]
            );

            // Get total students across all courses
            const [students] = await db.execute(`
                SELECT COUNT(DISTINCT ce.student_id) as total_students 
                FROM course_enrollments ce 
                JOIN courses c ON ce.course_id = c.id 
                WHERE c.lecturer_id = ? AND ce.status = "active"
            `, [lecturerId]);

            // Get recent live classes
            const [recentClasses] = await db.execute(`
                SELECT lc.*, c.title as course_title 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? 
                ORDER BY lc.scheduled_date DESC 
                LIMIT 5
            `, [lecturerId]);

            // Get upcoming classes
            const [upcomingClasses] = await db.execute(`
                SELECT lc.*, c.title as course_title 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? AND lc.scheduled_date > NOW() AND lc.status = "scheduled"
                ORDER BY lc.scheduled_date ASC 
                LIMIT 5
            `, [lecturerId]);

            // Get course list
            const [courseList] = await db.execute(`
                SELECT c.*, COUNT(ce.id) as enrolled_students 
                FROM courses c 
                LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = "active"
                WHERE c.lecturer_id = ? 
                GROUP BY c.id 
                ORDER BY c.created_at DESC
            `, [lecturerId]);

            res.render('dashboard/lecturer', {
                title: 'Lecturer Dashboard',
                user: req.user,
                stats: {
                    totalCourses: courses[0].total_courses,
                    totalStudents: students[0].total_students,
                    recentClasses: recentClasses.length,
                    upcomingClasses: upcomingClasses.length
                },
                recentClasses: recentClasses.map(cls => ({
                    ...cls,
                    scheduled_date: moment(cls.scheduled_date).format('MMMM D, YYYY h:mm A')
                })),
                upcomingClasses: upcomingClasses.map(cls => ({
                    ...cls,
                    scheduled_date: moment(cls.scheduled_date).format('MMMM D, YYYY h:mm A')
                })),
                courses: courseList
            });
        } catch (error) {
            console.error('Lecturer dashboard error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load dashboard' });
        }
    }

    // Student Dashboard
    async studentDashboard(req, res) {
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
                SELECT lc.*, c.title as course_title, c.course_code 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                JOIN course_enrollments ce ON c.id = ce.course_id 
                WHERE ce.student_id = ? AND lc.scheduled_date > NOW() AND lc.status = "scheduled"
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
                       COUNT(lc.id) as total_classes,
                       COUNT(ca.id) as attended_classes
                FROM courses c 
                JOIN course_enrollments ce ON c.id = ce.course_id 
                LEFT JOIN live_classes lc ON c.id = lc.course_id 
                LEFT JOIN class_attendance ca ON lc.id = ca.class_id AND ca.student_id = ce.student_id
                WHERE ce.student_id = ? AND ce.status = "active"
                GROUP BY c.id, ce.id 
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
                    scheduled_date: moment(cls.scheduled_date).format('MMMM D, YYYY h:mm A')
                })),
                recentClasses: recentClasses.map(cls => ({
                    ...cls,
                    joined_at: moment(cls.joined_at).format('MMMM D, YYYY h:mm A')
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
    }

    // Dashboard API endpoints
    async getDashboardStats(req, res) {
        try {
            const userId = req.user.userId;
            const userRole = req.user.role;

            if (userRole === 'lecturer') {
                // Lecturer stats
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
                // Student stats
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
            console.error('Dashboard stats error:', error);
            res.status(500).json({ message: 'Failed to fetch dashboard stats' });
        }
    }
}

module.exports = new DashboardController();
