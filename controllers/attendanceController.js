const db = require('../config/database');
const excelGenerator = require('../utils/excelGenerator');
const moment = require('moment');

class AttendanceController {
    // View attendance for a specific class
    async viewClassAttendance(req, res) {
        try {
            const classId = req.params.classId;
            const lecturerId = req.user.userId;

            // Get class details
            const [classes] = await db.execute(`
                SELECT lc.*, c.title as course_title, c.lecturer_id 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE lc.id = ? AND c.lecturer_id = ?
            `, [classId, lecturerId]);

            if (classes.length === 0) {
                return res.status(404).render('error', { title: 'Error', message: 'Class not found' });
            }

            const classData = classes[0];

            // Get attendance records
            const [attendance] = await db.execute(`
                SELECT ca.*, u.first_name, u.last_name, u.email 
                FROM class_attendance ca 
                JOIN users u ON ca.student_id = u.id 
                WHERE ca.class_id = ? 
                ORDER BY ca.joined_at ASC
            `, [classId]);

            res.render('attendance/class', {
                title: 'Class Attendance',
                classData: {
                    ...classData,
                    scheduled_date: moment(classData.scheduled_date).format('MMMM D, YYYY h:mm A')
                },
                attendance: attendance.map(record => ({
                    ...record,
                    joined_at: record.joined_at ? moment(record.joined_at).format('h:mm A') : 'N/A',
                    left_at: record.left_at ? moment(record.left_at).format('h:mm A') : 'Still in class'
                }))
            });
        } catch (error) {
            console.error('View attendance error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load attendance' });
        }
    }

    // Export attendance as Excel
    async exportAttendance(req, res) {
        try {
            const classId = req.params.classId;
            const lecturerId = req.user.userId;

            // Get class details
            const [classes] = await db.execute(`
                SELECT lc.*, c.title as course_title, c.lecturer_id 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE lc.id = ? AND c.lecturer_id = ?
            `, [classId, lecturerId]);

            if (classes.length === 0) {
                return res.status(404).json({ message: 'Class not found' });
            }

            const classData = classes[0];

            // Get attendance records
            const [attendance] = await db.execute(`
                SELECT ca.*, u.first_name, u.last_name, u.email, u.id as student_id
                FROM class_attendance ca 
                JOIN users u ON ca.student_id = u.id 
                WHERE ca.class_id = ? 
                ORDER BY ca.joined_at ASC
            `, [classId]);

            // Generate Excel file
            const excelFile = await excelGenerator.generateAttendanceReport(classData, attendance);

            res.json({
                success: true,
                downloadUrl: excelFile.url,
                filename: excelFile.filename
            });
        } catch (error) {
            console.error('Export attendance error:', error);
            res.status(500).json({ success: false, message: 'Failed to export attendance' });
        }
    }

    // Overall attendance summary
    async summary(req, res) {
        try {
            const lecturerId = req.user.userId;

            // Get courses with attendance stats
            const [courses] = await db.execute(`
                SELECT c.id, c.title, c.course_code,
                       COUNT(DISTINCT lc.id) as total_classes,
                       COUNT(DISTINCT ce.student_id) as enrolled_students,
                       COUNT(DISTINCT ca.student_id) as active_attendees
                FROM courses c 
                LEFT JOIN live_classes lc ON c.id = lc.course_id 
                LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
                LEFT JOIN class_attendance ca ON lc.id = ca.class_id 
                WHERE c.lecturer_id = ? 
                GROUP BY c.id, c.title, c.course_code
                ORDER BY c.created_at DESC
            `, [lecturerId]);

            res.render('attendance/summary', {
                title: 'Attendance Summary',
                courses: courses
            });
        } catch (error) {
            console.error('Attendance summary error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load summary' });
        }
    }
}

module.exports = new AttendanceController();
