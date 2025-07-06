const express = require('express');
const classController = require('../controllers/classController');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

const router = express.Router();

// Apply authentication to all routes
router.use(auth);

// List classes
router.get('/', classController.index);

// Create class form (lecturers only)
router.get('/create', roleAuth('lecturer'), classController.createForm);

// Create class (lecturers only)
router.post('/create', roleAuth('lecturer'), classController.store);

// Start/Join class
router.get('/:id/start', classController.startClass);

// End class (lecturers only)
router.post('/:id/end', roleAuth('lecturer'), classController.endClass);

// View recordings (lecturers only)
router.get('/recordings', roleAuth('lecturer'), classController.recordings);

// Edit class form (lecturers only)
router.get('/:id/edit', roleAuth('lecturer'), async (req, res) => {
    try {
        const db = require('../config/database');
        const [classes] = await db.execute(`
            SELECT lc.*, c.title as course_title 
            FROM live_classes lc 
            JOIN courses c ON lc.course_id = c.id 
            WHERE lc.id = ?
        `, [req.params.id]);

        const [courses] = await db.execute(
            'SELECT id, title, course_code FROM courses WHERE lecturer_id = ?',
            [req.user.userId]
        );

        if (classes.length === 0) {
            return res.status(404).render('error', { title: 'Error', message: 'Class not found' });
        }

        res.render('classes/edit', {
            title: 'Edit Class',
            classData: classes[0],
            courses: courses
        });
    } catch (error) {
        console.error('Edit class form error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load edit form' });
    }
});

// Update class (lecturers only)
router.post('/:id/edit', roleAuth('lecturer'), async (req, res) => {
    try {
        const { title, description, scheduled_date, duration_minutes } = req.body;
        const db = require('../config/database');
        
        await db.execute(`
            UPDATE live_classes 
            SET title = ?, description = ?, scheduled_date = ?, duration_minutes = ?, updated_at = NOW()
            WHERE id = ?
        `, [title, description, scheduled_date, duration_minutes, req.params.id]);

        res.redirect('/classes');
    } catch (error) {
        console.error('Update class error:', error);
        res.status(500).render('error', { title: 'Error', message: 'Failed to update class' });
    }
});

module.exports = router;
