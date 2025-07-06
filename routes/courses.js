const express = require('express');
const multer = require('multer');
const path = require('path');
const courseController = require('../controllers/courseController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(auth);

// CRUD for courses
router.get('/', courseController.index);
router.get('/create', courseController.createForm);
router.post('/create', courseController.store);
router.get('/:id', courseController.show);
router.get('/:id/edit', courseController.editForm);
router.post('/:id/edit', courseController.update);
router.post('/:id/delete', courseController.destroy);

// Upload materials
router.post('/:id/materials/upload', upload.single('file'), async (req, res) => {
  const db = require('../config/database');
  const { title } = req.body;
  const file = req.file;
  await db.execute(
    `INSERT INTO course_materials (course_id, title, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?)`,
    [req.params.id, title, `/uploads/${file.filename}`, file.mimetype, file.size]
  );
  res.redirect(`/courses/${req.params.id}`);
});

module.exports = router;
