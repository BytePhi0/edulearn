const db = require('../config/database');

class User {
    static async create(userData) {
        const { username, email, password, role, first_name, last_name, phone } = userData;
        
        const [result] = await db.execute(`
            INSERT INTO users (username, email, password, role, first_name, last_name, phone, is_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [username, email, password, role, first_name, last_name, phone]);
        
        return result.insertId;
    }
    
    static async findById(id) {
        const [users] = await db.execute(
            'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
            [id]
        );
        return users[0] || null;
    }
    
    static async findByEmail(email) {
        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );
        return users[0] || null;
    }
    
    static async findByUsername(username) {
        const [users] = await db.execute(
            'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
            [username]
        );
        return users[0] || null;
    }
    
    static async update(id, userData) {
        const fields = [];
        const values = [];
        
        Object.keys(userData).forEach(key => {
            if (userData[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(userData[key]);
            }
        });
        
        if (fields.length === 0) return false;
        
        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
        
        const [result] = await db.execute(query, values);
        return result.affectedRows > 0;
    }
    
    static async delete(id) {
        const [result] = await db.execute(
            'UPDATE users SET is_active = FALSE WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
    
    static async getEnrolledCourses(studentId) {
        const [courses] = await db.execute(`
            SELECT c.*, ce.enrollment_date, ce.status as enrollment_status,
                   CONCAT(u.first_name, ' ', u.last_name) as lecturer_name
            FROM courses c 
            JOIN course_enrollments ce ON c.id = ce.course_id 
            JOIN users u ON c.lecturer_id = u.id 
            WHERE ce.student_id = ? AND ce.status = 'active'
            ORDER BY ce.enrollment_date DESC
        `, [studentId]);
        
        return courses;
    }
    
    static async getLecturerCourses(lecturerId) {
        const [courses] = await db.execute(`
            SELECT c.*, COUNT(ce.id) as enrolled_students
            FROM courses c 
            LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
            WHERE c.lecturer_id = ? AND c.status = 'active'
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `, [lecturerId]);
        
        return courses;
    }
}

module.exports = User;
