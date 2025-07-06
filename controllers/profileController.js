const db = require('../config/database');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

class ProfileController {
    // View profile
    async viewProfile(req, res) {
        try {
            const userId = req.user.userId;
            
            const [users] = await db.execute(`
                SELECT id, username, email, first_name, last_name, phone, profile_image, 
                       role, created_at, updated_at
                FROM users 
                WHERE id = ?
            `, [userId]);
            
            if (users.length === 0) {
                return res.status(404).render('error', { title: 'Error', message: 'User not found' });
            }
            
            const user = users[0];
            
            // Get user statistics based on role
            let stats = {};
            
            if (user.role === 'lecturer') {
                const [courseStats] = await db.execute(`
                    SELECT COUNT(*) as total_courses FROM courses WHERE lecturer_id = ?
                `, [userId]);
                
                const [studentStats] = await db.execute(`
                    SELECT COUNT(DISTINCT ce.student_id) as total_students
                    FROM course_enrollments ce 
                    JOIN courses c ON ce.course_id = c.id 
                    WHERE c.lecturer_id = ?
                `, [userId]);
                
                const [classStats] = await db.execute(`
                    SELECT COUNT(*) as total_classes 
                    FROM live_classes lc 
                    JOIN courses c ON lc.course_id = c.id 
                    WHERE c.lecturer_id = ?
                `, [userId]);
                
                stats = {
                    totalCourses: courseStats[0].total_courses,
                    totalStudents: studentStats[0].total_students,
                    totalClasses: classStats[0].total_classes
                };
            } else if (user.role === 'student') {
                const [courseStats] = await db.execute(`
                    SELECT COUNT(*) as enrolled_courses 
                    FROM course_enrollments 
                    WHERE student_id = ? AND status = 'active'
                `, [userId]);
                
                const [attendanceStats] = await db.execute(`
                    SELECT COUNT(*) as classes_attended 
                    FROM class_attendance 
                    WHERE student_id = ?
                `, [userId]);
                
                stats = {
                    enrolledCourses: courseStats[0].enrolled_courses,
                    classesAttended: attendanceStats[0].classes_attended
                };
            }
            
            res.render('profile/view', {
                title: 'My Profile',
                user: req.user,
                profile: user,
                stats: stats
            });
        } catch (error) {
            console.error('View profile error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load profile' });
        }
    }
    
    // Edit profile form
    async editForm(req, res) {
        try {
            const userId = req.user.userId;
            
            const [users] = await db.execute(`
                SELECT id, username, email, first_name, last_name, phone, profile_image
                FROM users 
                WHERE id = ?
            `, [userId]);
            
            if (users.length === 0) {
                return res.status(404).render('error', { title: 'Error', message: 'User not found' });
            }
            
            res.render('profile/edit', {
                title: 'Edit Profile',
                user: req.user,
                profile: users[0]
            });
        } catch (error) {
            console.error('Edit profile form error:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to load edit form' });
        }
    }
    
    // Update profile
    async updateProfile(req, res) {
        try {
            const userId = req.user.userId;
            const { first_name, last_name, phone } = req.body;
            
            await db.execute(`
                UPDATE users 
                SET first_name = ?, last_name = ?, phone = ?, updated_at = NOW()
                WHERE id = ?
            `, [first_name, last_name, phone, userId]);
            
            res.json({ success: true, message: 'Profile updated successfully' });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({ success: false, message: 'Failed to update profile' });
        }
    }
    
    // Change password
    async changePassword(req, res) {
        try {
            const userId = req.user.userId;
            const { current_password, new_password, confirm_password } = req.body;
            
            // Validate passwords match
            if (new_password !== confirm_password) {
                return res.status(400).json({ success: false, message: 'New passwords do not match' });
            }
            
            // Get current user
            const [users] = await db.execute('SELECT password FROM users WHERE id = ?', [userId]);
            if (users.length === 0) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
            
            // Verify current password
            const isCurrentPasswordValid = await bcrypt.compare(current_password, users[0].password);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
            
            // Hash new password
            const hashedNewPassword = await bcrypt.hash(new_password, 12);
            
            // Update password
            await db.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', 
                [hashedNewPassword, userId]);
            
            res.json({ success: true, message: 'Password changed successfully' });
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({ success: false, message: 'Failed to change password' });
        }
    }
    
    // Upload profile image
    async uploadProfileImage(req, res) {
        try {
            const userId = req.user.userId;
            
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }
            
            const imagePath = `/uploads/${req.file.filename}`;
            
            await db.execute('UPDATE users SET profile_image = ?, updated_at = NOW() WHERE id = ?', 
                [imagePath, userId]);
            
            res.json({ 
                success: true, 
                message: 'Profile image updated successfully',
                imageUrl: imagePath
            });
        } catch (error) {
            console.error('Upload profile image error:', error);
            res.status(500).json({ success: false, message: 'Failed to upload image' });
        }
    }
}

module.exports = new ProfileController();
