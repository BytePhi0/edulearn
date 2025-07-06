const db = require('../config/database');

class Course {
    static async create(courseData) {
        const { title, description, lecturer_id, course_code, credits, semester, year, thumbnail } = courseData;
        
        const [result] = await db.execute(`
            INSERT INTO courses (title, description, lecturer_id, course_code, credits, semester, year, thumbnail)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, description, lecturer_id, course_code, credits, semester, year, thumbnail]);
        
        return result.insertId;
    }
    
    static async findById(id) {
        const [courses] = await db.execute(`
            SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as lecturer_name
            FROM courses c 
            JOIN users u ON c.lecturer_id = u.id 
            WHERE c.id = ? AND c.status = 'active'
        `, [id]);
        
        return courses[0] || null;
    }
    
    static async findByCode(courseCode) {
        const [courses] = await db.execute(
            'SELECT * FROM courses WHERE course_code = ? AND status = "active"',
            [courseCode]
        );
        return courses[0] || null;
    }
    
    static async update(id, courseData) {
        const fields = [];
        const values = [];
        
        Object.keys(courseData).forEach(key => {
            if (courseData[key] !== undefined) {
                fields.push(`${key} = ?`);
                values.push(courseData[key]);
            }
        });
        
        if (fields.length === 0) return false;
        
        values.push(id);
        const query = `UPDATE courses SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
        
        const [result] = await db.execute(query, values);
        return result.affectedRows > 0;
    }
    
    static async delete(id) {
        const [result] = await db.execute(
            'UPDATE courses SET status = "inactive" WHERE id = ?',
            [id]
        );
        return result.affectedRows > 0;
    }
    
    static async getEnrolledStudents(courseId) {
        const [students] = await db.execute(`
            SELECT u.id, u.username, u.email, u.first_name, u.last_name, 
                   ce.enrollment_date, ce.status
            FROM users u 
            JOIN course_enrollments ce ON u.id = ce.student_id 
            WHERE ce.course_id = ? AND ce.status = 'active'
            ORDER BY ce.enrollment_date DESC
        `, [courseId]);
        
        return students;
    }
    
    static async getMaterials(courseId) {
        const [materials] = await db.execute(`
            SELECT * FROM course_materials 
            WHERE course_id = ? AND is_public = TRUE 
            ORDER BY upload_date DESC
        `, [courseId]);
        
        return materials;
    }
    
    static async addMaterial(courseId, materialData) {
        const { title, file_path, file_type, file_size, description } = materialData;
        
        const [result] = await db.execute(`
            INSERT INTO course_materials (course_id, title, file_path, file_type, file_size, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [courseId, title, file_path, file_type, file_size, description]);
        
        return result.insertId;
    }
    
    static async enrollStudent(courseId, studentId) {
        try {
            const [result] = await db.execute(`
                INSERT INTO course_enrollments (student_id, course_id)
                VALUES (?, ?)
            `, [studentId, courseId]);
            
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Already enrolled in this course');
            }
            throw error;
        }
    }
    
    static async unenrollStudent(courseId, studentId) {
        const [result] = await db.execute(`
            UPDATE course_enrollments 
            SET status = 'dropped' 
            WHERE course_id = ? AND student_id = ?
        `, [courseId, studentId]);
        
        return result.affectedRows > 0;
    }
}

module.exports = Course;
