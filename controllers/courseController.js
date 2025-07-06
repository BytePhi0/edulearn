const db = require('../config/database');
const moment = require('moment');

class CourseController {
  // List all courses (lecturer)
  async index(req, res) {
    try {
      const lecturerId = req.user.userId;
      const [courses] = await db.execute(
        `SELECT c.*, 
                COUNT(ce.id) AS enrolled_students 
         FROM courses c 
         LEFT JOIN course_enrollments ce 
           ON c.id = ce.course_id AND ce.status='active'
         WHERE c.lecturer_id = ?
         GROUP BY c.id 
         ORDER BY c.created_at DESC`,
        [lecturerId]
      );
      res.render('courses/index', { title: 'My Courses', courses });
    } catch (err) {
      console.error(err);
      res.status(500).render('error', { title:'Error', message:'Unable to load courses' });
    }
  }

  // Show create course form
  createForm(req, res) {
    res.render('courses/create', { title: 'Create Course' });
  }

  // Handle create course submission
  async store(req, res) {
    try {
      const { title, description, course_code, credits, semester, year } = req.body;
      await db.execute(
        `INSERT INTO courses 
         (title, description, lecturer_id, course_code, credits, semester, year) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description, req.user.userId, course_code, credits, semester, year]
      );
      res.redirect('/courses');
    } catch (err) {
      console.error(err);
      res.status(500).render('error', { title:'Error', message:'Failed to create course' });
    }
  }

  // View single course
  async show(req, res) {
    try {
      const courseId = req.params.id;
      const [[course]] = await db.execute(
        `SELECT * FROM courses WHERE id = ?`, [courseId]
      );
      const [materials] = await db.execute(
        `SELECT * FROM course_materials WHERE course_id = ? ORDER BY upload_date DESC`,
        [courseId]
      );
      res.render('courses/view', { title: course.title, course, materials });
    } catch (err) {
      console.error(err);
      res.status(500).render('error', { title:'Error', message:'Unable to load course' });
    }
  }

  // Show edit form
  async editForm(req, res) {
    const [[course]] = await db.execute(`SELECT * FROM courses WHERE id = ?`, [req.params.id]);
    res.render('courses/edit', { title:'Edit Course', course });
  }

  // Handle update
  async update(req, res) {
    try {
      const { title, description, course_code, credits, semester, year } = req.body;
      await db.execute(
        `UPDATE courses 
         SET title=?, description=?, course_code=?, credits=?, semester=?, year=?, updated_at=NOW() 
         WHERE id=?`,
        [title, description, course_code, credits, semester, year, req.params.id]
      );
      res.redirect('/courses');
    } catch (err) {
      console.error(err);
      res.status(500).render('error', { title:'Error', message:'Failed to update course' });
    }
  }

  // Delete course
  async destroy(req, res) {
    try {
      await db.execute(`DELETE FROM courses WHERE id=?`, [req.params.id]);
      res.redirect('/courses');
    } catch (err) {
      console.error(err);
      res.status(500).render('error', { title:'Error', message:'Failed to delete course' });
    }
  }
}

module.exports = new CourseController();
