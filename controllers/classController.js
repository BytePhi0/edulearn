const db = require('../config/database');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const meetingService = require('../utils/meetingService');

class ClassController {
    // List all classes for lecturer
    async index(req, res) {
        try {
            const lecturerId = req.user.userId;
            const [classes] = await db.execute(`
                SELECT lc.*, c.title as course_title, c.course_code 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? 
                ORDER BY lc.scheduled_date DESC
            `, [lecturerId]);

            res.render('classes/index', { 
                title: 'Live Classes', 
                classes: classes.map(cls => ({
                    ...cls,
                    scheduled_date: moment(cls.scheduled_date).format('MMMM D, YYYY h:mm A')
                }))
            });
        } catch (error) {
            console.error('Classes index error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load classes' });
        }
    }

    // Show create class form
    async createForm(req, res) {
        try {
            const lecturerId = req.user.userId;
            const [courses] = await db.execute(
                'SELECT id, title, course_code FROM courses WHERE lecturer_id = ? AND status = "active"',
                [lecturerId]
            );

            res.render('classes/create', { 
                title: 'Create Live Class',
                courses: courses
            });
        } catch (error) {
            console.error('Create class form error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load form' });
        }
    }

    // Create new class
    async store(req, res) {
        try {
            const { course_id, title, description, scheduled_date, duration_minutes, meeting_type } = req.body;
            
            // Generate meeting details
            const meetingId = uuidv4();
            let meetingLink = '';
            let meetingPassword = '';

            if (meeting_type === 'google_meet') {
                const meetingData = await meetingService.createGoogleMeet(title, scheduled_date);
                meetingLink = meetingData.hangoutLink;
                meetingPassword = meetingData.conferenceData?.entryPoints?.[0]?.pin || '';
            } else if (meeting_type === 'bigbluebutton') {
                const meetingData = await meetingService.createBBBMeeting(meetingId, title);
                meetingLink = meetingData.url;
                meetingPassword = meetingData.attendeePW;
            }

            // Insert class into database
            const [result] = await db.execute(`
                INSERT INTO live_classes 
                (course_id, title, description, meeting_link, meeting_id, meeting_password, scheduled_date, duration_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [course_id, title, description, meetingLink, meetingId, meetingPassword, scheduled_date, duration_minutes]);

            res.redirect('/classes');
        } catch (error) {
            console.error('Create class error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to create class' });
        }
    }

    // Start/Join class
    async startClass(req, res) {
        try {
            const classId = req.params.id;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // Get class details
            const [classes] = await db.execute(`
                SELECT lc.*, c.title as course_title, c.lecturer_id 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE lc.id = ?
            `, [classId]);

            if (classes.length === 0) {
                return res.status(404).render('error', { title: 'Error', message: 'Class not found' });
            }

            const classData = classes[0];

            // Check permissions
            if (userRole === 'lecturer' && classData.lecturer_id !== userId) {
                return res.status(403).render('error', { title: 'Error', message: 'Access denied' });
            }

            if (userRole === 'student') {
                // Check if student is enrolled in the course
                const [enrollment] = await db.execute(
                    'SELECT id FROM course_enrollments WHERE student_id = ? AND course_id = ? AND status = "active"',
                    [userId, classData.course_id]
                );

                if (enrollment.length === 0) {
                    return res.status(403).render('error', { title: 'Error', message: 'You are not enrolled in this course' });
                }

                // Record attendance
                await db.execute(`
                    INSERT INTO class_attendance (class_id, student_id, joined_at) 
                    VALUES (?, ?, NOW()) 
                    ON DUPLICATE KEY UPDATE joined_at = NOW()
                `, [classId, userId]);
            }

            // Update class status to live if starting
            if (userRole === 'lecturer') {
                await db.execute(
                    'UPDATE live_classes SET status = "live" WHERE id = ?',
                    [classId]
                );
            }

            res.render('classes/live', {
                title: 'Live Class',
                classData: classData,
                user: req.user
            });
        } catch (error) {
            console.error('Start class error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to start class' });
        }
    }

    // End class
    async endClass(req, res) {
        try {
            const classId = req.params.id;
            
            // Update class status
            await db.execute(
                'UPDATE live_classes SET status = "completed" WHERE id = ?',
                [classId]
            );

            // Update all attendance records with left_at time
            await db.execute(`
                UPDATE class_attendance 
                SET left_at = NOW(), 
                    duration_minutes = TIMESTAMPDIFF(MINUTE, joined_at, NOW())
                WHERE class_id = ? AND left_at IS NULL
            `, [classId]);

            res.json({ success: true, message: 'Class ended successfully' });
        } catch (error) {
            console.error('End class error:', error);
            res.status(500).json({ success: false, message: 'Failed to end class' });
        }
    }

    // Get class recordings
    async recordings(req, res) {
        try {
            const lecturerId = req.user.userId;
            const [recordings] = await db.execute(`
                SELECT lc.*, c.title as course_title 
                FROM live_classes lc 
                JOIN courses c ON lc.course_id = c.id 
                WHERE c.lecturer_id = ? AND lc.recording_url IS NOT NULL
                ORDER BY lc.scheduled_date DESC
            `, [lecturerId]);

            res.render('classes/recordings', { 
                title: 'Class Recordings',
                recordings: recordings.map(rec => ({
                    ...rec,
                    scheduled_date: moment(rec.scheduled_date).format('MMMM D, YYYY h:mm A')
                }))
            });
        } catch (error) {
            console.error('Recordings error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load recordings' });
        }
    }
}

module.exports = new ClassController();
