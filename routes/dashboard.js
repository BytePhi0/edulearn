const express = require('express');
const router = express.Router();
const db = require('../config/database');  // Assuming you're using PostgreSQL now
// const pool = require('../config/database');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ====== CONFIG ======
const WHEREBY_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmFwcGVhci5pbiIsImF1ZCI6Imh0dHBzOi8vYXBpLmFwcGVhci5pbi92MSIsImV4cCI6OTAwNzE5OTI1NDc0MDk5MSwiaWF0IjoxNzUxNTYxNjEzLCJvcmdhbml6YXRpb25JZCI6MzE5MzgyLCJqdGkiOiJmMWZiMDdkZS0wNDA2LTQzOTUtOTdkNC00ZmRmNmM1ZjkyMDAifQ.uRHUvgdUsY-fYevcQ2YxF33c0b2rA_JbcLDIwirqQ6g';



// ====== MULTER SETUP ======
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const recStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/recordings');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const recUpload = multer({ storage: recStorage });

// ====== AUTH MIDDLEWARE ======
function requireLecturer(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'lecturer') {
    return res.redirect('/auth?role=lecturer&mode=login');
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.redirect('/auth?role=student&mode=login');
  }
  next();
}

let currentLiveRoomUrl = null;

// ====== LECTURER ROUTES ======
router.get('/lecturer', requireLecturer, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [[profile]] = await pool.query(
      'SELECT name, email, department FROM users WHERE id = ? AND role = "lecturer"',
      [userId]
    );

    const [courses] = await pool.query('SELECT id, title, course_code, enrolled FROM courses WHERE lecturer_id = ?', [userId]);

    for (const course of courses) {
      const [materials] = await pool.query('SELECT id, title, file_url, type FROM materials WHERE course_id = ?', [course.id]);
      course.materials = materials;
    }

    const perPage = 10;
    const attendancePage = parseInt(req.query.attendancePage) || 1;
    const offset = (attendancePage - 1) * perPage;

    const [attendanceRecords] = await pool.query(
      'SELECT date, course_code AS course, present, absent FROM attendance WHERE lecturer_id = ? ORDER BY date DESC LIMIT ? OFFSET ?',
      [userId, perPage, offset]
    );

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM attendance WHERE lecturer_id = ?',
      [userId]
    );
    const attendanceTotalPages = Math.max(1, Math.ceil(total / perPage));

    const [recentActivity] = await pool.query('SELECT icon, text, time FROM recent_activity WHERE lecturer_id = ? ORDER BY time DESC LIMIT 10', [userId]);

    const [upcomingClasses] = await pool.query(
      'SELECT title, date FROM classes WHERE course_id IN (SELECT id FROM courses WHERE lecturer_id = ?) AND date >= CURDATE() ORDER BY date',
      [userId]
    );

    const totalStudents = courses.reduce((sum, c) => sum + c.enrolled, 0);
    const liveToday = currentLiveRoomUrl ? 1 : 0;
    const attendancePercent = total
      ? Math.round(
          attendanceRecords.reduce((sum, r) => sum + r.present, 0) /
          attendanceRecords.reduce((sum, r) => sum + r.present + r.absent, 0) * 100
        )
      : 0;

    let classEnded = false;
    let lastAttendance = [];
    // Show the most recent class, even if not ended, for better UX
    const [lastClass] = await pool.query(
      `SELECT id, title, date FROM classes 
       WHERE lecturer_id = ? 
       ORDER BY date DESC LIMIT 1`, [userId]
    );
    
    if (lastClass.length) {
      classEnded = true;
      const classId = lastClass[0].id;
      [lastAttendance] = await pool.query(
        `SELECT u.name AS student_name, a.status, a.joined_at, a.left_at, a.duration_minutes
         FROM class_attendance a
         JOIN users u ON a.student_id = u.id
         WHERE a.class_id = ?
         ORDER BY a.joined_at`, [classId]
      );
    }

    res.render('dashboard/lecturer', {
      user: req.session.user,
      stats: {
        courses: courses.length,
        students: totalStudents,
        liveToday,
        attendance: attendancePercent
      },
      upcomingClasses,
      recentActivity,
      roomUrl: currentLiveRoomUrl,
      courses,
      attendanceRecords,
      attendancePage,
      attendanceTotalPages,
      profile,
      classEnded,
      lastAttendance,
      error: null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Add course
router.post('/lecturer/add-course', requireLecturer, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { title, code, enrolled } = req.body;
    await pool.query('INSERT INTO courses (title, course_code, enrolled, lecturer_id) VALUES (?, ?, ?, ?)', [title, code, enrolled, userId]);
    await pool.query('INSERT INTO recent_activity (icon, text, time, lecturer_id) VALUES (?, ?, NOW(), ?)', ['fa-book', `Added new course: ${title}`, userId]);
    res.redirect('/dashboard/lecturer');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/lecturer/course/:id/materials', requireLecturer, upload.single('file'), async (req, res) => {
  try {
    const courseId = req.params.id;
    const { title, type } = req.body;
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
    const fileUrl = '/uploads/' + req.file.filename;
    await pool.query('INSERT INTO materials (course_id, title, file_url, type) VALUES (?, ?, ?, ?)', [courseId, title, fileUrl, type]);
    res.redirect('/dashboard/lecturer');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to upload material');
  }
});

router.post('/lecturer/live-class', requireLecturer, async (req, res) => {
  try {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const userId = req.session.user.id;
    // Pick the first course for the lecturer as the live class course (or let them pick in the UI)
    const [courses] = await pool.query('SELECT id FROM courses WHERE lecturer_id = ? LIMIT 1', [userId]);
    if (!courses.length) return res.status(400).send('No course found for lecturer');
    const courseId = courses[0].id;
    const [result] = await pool.query(
      'INSERT INTO classes (course_id, lecturer_id, title, date) VALUES (?, ?, ?, ?)',
      [courseId, userId, 'Live Class', startDate]
    );
    // Save the class ID in the session for both dashboards to use
    req.session.currentLiveClassId = result.insertId;

    const response = await axios.post(
      'https://api.whereby.dev/v1/meetings',
      {
        roomNamePrefix: 'edulearn',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        fields: ['hostRoomUrl', 'roomUrl']
      },
      { headers: { Authorization: `Bearer ${WHEREBY_API_KEY}` } }
    );
    currentLiveRoomUrl = response.data.roomUrl;
    await pool.query('INSERT INTO recent_activity (icon, text, time, lecturer_id) VALUES (?, ?, NOW(), ?)', ['fa-video', 'Started a new live class', userId]);
    res.redirect('/dashboard/lecturer');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create live class');
  }
});

router.post('/lecturer/end-class', requireLecturer, async (req, res) => {
  try {
    currentLiveRoomUrl = null;
    req.session.currentLiveClassId = null;
    const userId = req.session.user.id;
    await pool.query('INSERT INTO recent_activity (icon, text, time, lecturer_id) VALUES (?, ?, NOW(), ?)', ['fa-video-slash', 'Ended the live class', userId]);
    res.redirect('/dashboard/lecturer');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to end live class');
  }
});

router.post('/lecturer/profile', requireLecturer, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, email, department } = req.body;
    await pool.query('UPDATE users SET name = ?, email = ?, department = ? WHERE id = ? AND role = "lecturer"', [name, email, department, userId]);
    await pool.query('INSERT INTO recent_activity (icon, text, time, lecturer_id) VALUES (?, ?, NOW(), ?)', ['fa-user-edit', 'Updated profile', userId]);
    res.redirect('/dashboard/lecturer');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update profile');
  }
});

// ====== STUDENT ROUTES ======

router.get('/student', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [[profile]] = await pool.query('SELECT name, email, department FROM users WHERE id = ? AND role = "student"', [userId]);

    const [studentCourses] = await pool.query(
      'SELECT c.id, c.title, c.course_code, COALESCE(sc.progress, 0) AS progress FROM student_courses sc JOIN courses c ON sc.course_id = c.id WHERE sc.student_id = ?',
      [userId]
    );

    const courseIds = studentCourses.map(c => c.id);
    let recordings = [];
    if (courseIds.length) {
      [recordings] = await pool.query(
        'SELECT r.*, c.title AS course_title FROM recordings r JOIN courses c ON r.course_id = c.id WHERE r.course_id IN (?) AND r.shared_with_students = 1 ORDER BY r.uploaded_at DESC',
        [courseIds]
      );
    }

    let materials = [];
    if (courseIds.length) {
      [materials] = await pool.query(
        'SELECT id, title, file_url, type, course_id FROM materials WHERE course_id IN (?)',
        [courseIds]
      );
    }

    studentCourses.forEach(course => {
      course.materials = materials.filter(m => m.course_id === course.id);
      course.progress = parseInt(course.progress) || 0;
    });

    const [availableCourses] = await pool.query(
      `SELECT c.id, c.title, c.course_code
       FROM courses c
       WHERE (c.status = 'active' OR c.status IS NULL)
       AND c.id NOT IN (
         SELECT course_id FROM student_courses WHERE student_id = ?
       )`,
      [userId]
    );

    // Show all upcoming classes for enrolled courses
    const [upcomingClasses] = courseIds.length
      ? await pool.query(
          'SELECT id, title, date FROM classes WHERE course_id IN (?) AND date >= NOW() ORDER BY date',
          [courseIds]
        )
      : [[]];

    // Find the current live class for the student
    let currentClassId = null;
    let roomUrl = null;
    if (courseIds.length) {
      // Find a live class within +/- 2 hours of now
      const [liveClasses] = await pool.query(
        'SELECT id, date FROM classes WHERE course_id IN (?) AND date <= NOW() AND DATE_ADD(date, INTERVAL 2 HOUR) >= NOW() ORDER BY date DESC LIMIT 1',
        [courseIds]
      );
      if (liveClasses.length) {
        currentClassId = liveClasses[0].id;
        roomUrl = currentLiveRoomUrl;
      }
    }

    const enrolled = studentCourses.length;
    const hours = 24;
    const attendance = 85;
    const grade = 'A-';

    res.render('dashboard/student', {
      user: req.session.user,
      stats: { enrolled, hours, attendance, grade },
      courses: studentCourses,
      availableCourses,
      upcomingClasses,
      materials,
      recordings,
      currentClassId,
      roomUrl,
      profile
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.post('/student/enroll', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { course_id } = req.body;
    await pool.query(
      'INSERT IGNORE INTO student_courses (student_id, course_id, progress) VALUES (?, ?, 0)',
      [userId, course_id]
    );
    await pool.query(
      'UPDATE student_courses SET progress = 0 WHERE student_id = ? AND course_id = ? AND progress IS NULL',
      [userId, course_id]
    );
    res.redirect('/dashboard/student');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to enroll in course');
  }
});

router.post('/student/profile', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, email, department } = req.body;
    await pool.query('UPDATE users SET name = ?, email = ?, department = ? WHERE id = ? AND role = "student"', [name, email, department, userId]);
    res.redirect('/dashboard/student');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update profile');
  }
});

router.post('/student/course/:id/progress', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const courseId = req.params.id;
    const { percent } = req.body;
    const validPercent = Math.max(0, Math.min(100, parseInt(percent) || 0));
    const [rows] = await pool.query('SELECT * FROM student_courses WHERE student_id = ? AND course_id = ?', [userId, courseId]);
    if (rows.length) {
      await pool.query('UPDATE student_courses SET progress = ? WHERE student_id = ? AND course_id = ?', [validPercent, userId, courseId]);
    } else {
      await pool.query('INSERT INTO student_courses (student_id, course_id, progress) VALUES (?, ?, ?)', [userId, courseId, validPercent]);
    }
    res.redirect('/dashboard/student');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update progress');
  }
});

router.post('/student/course/:courseId/material/:materialId/read', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { courseId, materialId } = req.params;
    await pool.query(
      'INSERT IGNORE INTO course_material_reads (student_id, course_id, material_id) VALUES (?, ?, ?)',
      [userId, courseId, materialId]
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM materials WHERE course_id = ?',
      [courseId]
    );
    const [[{ materials_read }]] = await pool.query(
      'SELECT COUNT(*) AS materials_read FROM course_material_reads WHERE student_id = ? AND course_id = ?',
      [userId, courseId]
    );
    const percent = total > 0 ? Math.round((materials_read / total) * 100) : 0;
    const [existingRecord] = await pool.query(
      'SELECT id FROM student_courses WHERE student_id = ? AND course_id = ?',
      [userId, courseId]
    );
    if (existingRecord.length === 0) {
      await pool.query(
        'INSERT INTO student_courses (student_id, course_id, progress) VALUES (?, ?, ?)',
        [userId, courseId, percent]
      );
    } else {
      await pool.query(
        'UPDATE student_courses SET progress = ? WHERE student_id = ? AND course_id = ?',
        [percent, userId, courseId]
      );
    }
    res.json({ 
      success: true, 
      percent: percent,
      progress: percent,
      read: materials_read,
      total: total,
      message: `Progress updated to ${percent}%`
    });

  } catch (err) {
    console.error('Error in material read tracking:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark material as read or update progress.',
      details: err.message
    });
  }
});

router.get('/dashboard/lecturer/attendance/export', requireLecturer, async (req, res) => {
  const userId = req.session.user.id;
  const [lastClass] = await pool.query(
    `SELECT id, title, date FROM classes 
     WHERE lecturer_id = ? 
     ORDER BY date DESC LIMIT 1`, [userId]
  );
  if (!lastClass.length) return res.status(404).send('No class found.');
  const classId = lastClass[0].id;
  const [rows] = await pool.query(
    `SELECT u.name AS student_name, a.status, a.joined_at, a.left_at, a.duration_minutes
     FROM class_attendance a
     JOIN users u ON a.student_id = u.id
     WHERE a.class_id = ?
     ORDER BY a.joined_at`, [classId]
  );
  let csv = 'Student Name,Status,Joined At,Left At,Duration (min)\n';
  rows.forEach(r => {
    csv += `"${r.student_name}","${r.status}","${r.joined_at}","${r.left_at || ''}","${r.duration_minutes || ''}"\n`;
  });
  res.header('Content-Type', 'text/csv');
  res.attachment('attendance.csv');
  res.send(csv);
});

router.post('/dashboard/student/class/:classId/attendance', requireStudent, async (req, res) => {
  const studentId = req.session.user.id;
  const classId = req.params.classId;
  console.log(`Recording attendance: studentId=${studentId}, classId=${classId}`);
  await pool.query(
    'INSERT IGNORE INTO class_attendance (class_id, student_id, joined_at, status) VALUES (?, ?, NOW(), "present")',
    [classId, studentId]
  );
  res.sendStatus(200);
});

router.post('/dashboard/lecturer/recordings/upload', requireLecturer, recUpload.single('recording'), async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const { course_id, class_id, title } = req.body;
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }
    const file_url = '/recordings/' + req.file.filename;
    await pool.query(
      'INSERT INTO recordings (lecturer_id, course_id, class_id, file_url, title, shared_with_students, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [lecturerId, course_id || 0, class_id || null, file_url, title || req.file.originalname, 0]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Recording upload error:', err);
    res.status(500).send('Failed to upload recording');
  }
});

router.get('/dashboard/student/recordings', requireStudent, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [studentCourses] = await pool.query(
      'SELECT course_id FROM student_courses WHERE student_id = ?',
      [userId]
    );
    const courseIds = studentCourses.map(c => c.course_id);
    let recordings = [];
    if (courseIds.length) {
      [recordings] = await pool.query(
        'SELECT r.*, c.title AS course_title FROM recordings r JOIN courses c ON r.course_id = c.id WHERE r.course_id IN (?) AND r.shared_with_students = 1 ORDER BY r.uploaded_at DESC',
        [courseIds]
      );
    }
    res.render('dashboard/student_recordings', { recordings });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

router.get('/dashboard/lecturer/recordings', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const [recordings] = await pool.query(
      'SELECT * FROM recordings WHERE lecturer_id = ? ORDER BY uploaded_at DESC',
      [lecturerId]
    );
    res.json(recordings);
  } catch (err) {
    console.error('Fetch lecturer recordings error:', err);
    res.status(500).send('Server error');
  }
});

router.post('/dashboard/lecturer/recordings/share/:id', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE recordings SET shared_with_students = 1 WHERE id = ? AND lecturer_id = ?',
      [id, lecturerId]
    );
    if (result.affectedRows === 0) return res.status(404).send('Not found');
    const [[rec]] = await pool.query(
      'SELECT course_id, title, file_url FROM recordings WHERE id = ?',
      [id]
    );
    await pool.query(
      'INSERT IGNORE INTO materials (course_id, title, file_url, type) VALUES (?, ?, ?, ?)',
      [rec.course_id, rec.title, rec.file_url, 'recording']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Share recording error:', err);
    res.status(500).send('Error sharing recording');
  }
});

router.get('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Failed to log out.');
    }
    res.clearCookie('connect.sid');
    res.redirect('/auth?mode=login');
  });
});

router.get('/lecturer/recordings', requireLecturer, async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const [recordings] = await pool.query(
      'SELECT * FROM recordings WHERE lecturer_id = ? ORDER BY uploaded_at DESC',
      [lecturerId]
    );
    res.json(recordings);
  } catch (err) {
    console.error('Fetch lecturer recordings error:', err);
    res.status(500).send('Server error');
  }
});

router.post('/lecturer/recordings/upload', requireLecturer, recUpload.single('recording'), async (req, res) => {
  try {
    const lecturerId = req.session.user.id;
    const { course_id, class_id, title } = req.body;
    if (!req.file) return res.status(400).send('No file uploaded');
    const file_url = '/recordings/' + req.file.filename;
    await pool.query(
      'INSERT INTO recordings (lecturer_id, course_id, class_id, file_url, title, shared_with_students, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [lecturerId, course_id || 0, class_id || null, file_url, title || req.file.originalname, 0]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Recording upload error:', err);
    res.status(500).send('Failed to upload recording');
  }
});

module.exports = router;
