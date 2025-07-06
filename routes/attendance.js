const express = require('express');
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

const router = express.Router();

// Apply authentication to all routes
router.use(auth);

// Attendance summary (lecturers only)
router.get('/', roleAuth('lecturer'), attendanceController.summary);

// View class attendance (lecturers only)
router.get('/class/:classId', roleAuth('lecturer'), attendanceController.viewClassAttendance);

// Export attendance (lecturers only)
router.get('/class/:classId/export', roleAuth('lecturer'), attendanceController.exportAttendance);

// Mark attendance manually (lecturers only)
router.post('/class/:classId/mark', roleAuth('lecturer'), async (req, res) => {
    try {
        const { student_id, status } = req.body;
        const classId = req.params.classId;
        const db = require('../config/database');

        await db.execute(`
            INSERT INTO class_attendance (class_id, student_id, status, joined_at) 
            VALUES (?, ?, ?, NOW()) 
            ON DUPLICATE KEY UPDATE status = ?, joined_at = NOW()
        `, [classId, student_id, status, status]);

        res.json({ success: true, message: 'Attendance marked successfully' });
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Failed to mark attendance' });
    }
});

module.exports = router;
