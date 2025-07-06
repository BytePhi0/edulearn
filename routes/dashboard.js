/* routes/dashboard.js  –  full PostgreSQL version  */
const express = require('express');
const axios   = require('axios');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const db      = require('../config/database');           // ← pg Pool

const router = express.Router();

/* ------------ helper so we type a bit less --------------- */
const q = (sql, params = []) => db.query(sql, params);

/* ------------ Whereby (put real key in .env) ------------- */
const WHEREBY_API_KEY = process.env.WHEREBY_API_KEY;

/* ------------ file‑upload storage ------------------------ */
const mkdir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d=path.join(__dirname,'../public/uploads'); mkdir(d); cb(null,d); },
    filename   : (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

const recUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d=path.join(__dirname,'../public/recordings'); mkdir(d); cb(null,d); },
    filename   : (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

/* ------------ auth guards -------------------------------- */
const requireLecturer = (req,res,next)=>
  (!req.session.user||req.session.user.role!=='lecturer')
    ? res.redirect('/auth?role=lecturer&mode=login') : next();

const requireStudent  = (req,res,next)=>
  (!req.session.user||req.session.user.role!=='student')
    ? res.redirect('/auth?role=student&mode=login')  : next();

/* ========================================================= *
 *                       LECTURER SIDE                       *
 * ========================================================= */
let currentLiveRoomUrl = null;

router.get('/lecturer', requireLecturer, async (req,res)=>{
  try{
    const uid = req.session.user.id;

    const { rows:[profile] } =
      await q(`SELECT name,email,department FROM users WHERE id=$1`,[uid]);

    const { rows:courses } =
      await q(`SELECT id,title,course_code,enrolled FROM courses WHERE lecturer_id=$1`,[uid]);

    /* attach materials to each course */
    for (const c of courses){
      const { rows:mats } = await q(`SELECT id,title,file_url,type FROM materials WHERE course_id=$1`,[c.id]);
      c.materials = mats;
    }

    /* paginated attendance */
    const perPage        = 10;
    const page           = +req.query.attendancePage || 1;
    const offset         = (page-1)*perPage;

    const { rows:att }   = await q(
      `SELECT date,course_code AS course,present,absent
         FROM attendance
        WHERE lecturer_id=$1
        ORDER BY date DESC
        LIMIT $2 OFFSET $3`, [uid, perPage, offset]);

    const { rows:[{total}]} = await q(
      `SELECT COUNT(*)::int AS total FROM attendance WHERE lecturer_id=$1`,[uid]);

    /* recent activity & upcoming classes */
    const { rows:recent } = await q(
      `SELECT icon,text,time
         FROM recent_activity
        WHERE lecturer_id=$1
        ORDER BY time DESC LIMIT 10`,[uid]);

    const { rows:upcoming } = await q(
      `SELECT title,date
         FROM classes
        WHERE course_id IN (SELECT id FROM courses WHERE lecturer_id=$1)
          AND date >= CURRENT_DATE
        ORDER BY date`,[uid]);

    /* attendance % */
    const attendancePct = total
      ? Math.round(att.reduce((s,r)=>s+r.present,0) /
                   att.reduce((s,r)=>s+r.present+r.absent,0) * 100)
      : 0;

    /* last class & attendance list */
    const { rows:lastArr } = await q(
      `SELECT id,title,date
         FROM classes
        WHERE lecturer_id=$1
        ORDER BY date DESC
        LIMIT 1`,[uid]);

    let classEnded=false, lastAttendance=[];
    if (lastArr.length){
      classEnded=true;
      const classId=lastArr[0].id;
      const { rows } = await q(
        `SELECT u.name AS student_name,
                a.status,a.joined_at,a.left_at,a.duration_minutes
           FROM class_attendance a
      LEFT JOIN users u ON u.id=a.student_id
          WHERE a.class_id=$1
          ORDER BY a.joined_at`, [classId]);
      lastAttendance = rows;
    }

    res.render('dashboard/lecturer',{
      user : req.session.user,
      stats: {
        courses   : courses.length,
        students  : courses.reduce((s,c)=>s+c.enrolled,0),
        liveToday : currentLiveRoomUrl?1:0,
        attendance: attendancePct
      },
      upcomingClasses  : upcoming,
      recentActivity   : recent,
      roomUrl          : currentLiveRoomUrl,
      courses,
      attendanceRecords: att,
      attendancePage   : page,
      attendanceTotalPages: Math.max(1,Math.ceil(total/perPage)),
      profile, classEnded, lastAttendance, error:null
    });

  }catch(e){ console.error(e); res.status(500).send('Server error'); }
});

/* ---------- add course ---------- */
router.post('/lecturer/add-course', requireLecturer, async (req,res)=>{
  try{
    const uid=req.session.user.id;
    const { title, code, enrolled } = req.body;

    await q(
      `INSERT INTO courses (title,course_code,enrolled,lecturer_id)
       VALUES ($1,$2,$3,$4)`,[title,code,enrolled,uid]);

    await q(
      `INSERT INTO recent_activity (icon,text,time,lecturer_id)
       VALUES ('fa-book',$1,NOW(),$2)`,[`Added new course: ${title}`,uid]);

    res.redirect('/dashboard/lecturer');
  }catch(e){ console.error(e); res.status(500).send('Error'); }
});

/* ---------- upload material ---------- */
router.post('/lecturer/course/:id/materials', requireLecturer,
            upload.single('file'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).send('No file');
    const fileUrl = '/uploads/'+req.file.filename;
    const { id }  = req.params;
    const { title,type } = req.body;

    await q(
      `INSERT INTO materials (course_id,title,file_url,type)
       VALUES ($1,$2,$3,$4)`,[id,title,fileUrl,type]);

    res.redirect('/dashboard/lecturer');
  }catch(e){ console.error(e); res.status(500).send('Upload error'); }
});

/* ---------- live class ---------- */
router.post('/lecturer/live-class', requireLecturer, async (req,res)=>{
  try{
    const uid = req.session.user.id;
    const start = new Date();
    const end   = new Date(start.getTime()+60*60*1000);

    const { rows:c } = await q(
      `SELECT id FROM courses WHERE lecturer_id=$1 LIMIT 1`,[uid]);
    if(!c.length) return res.status(400).send('No course');

    const courseId=c[0].id;

    const insert = await q(
      `INSERT INTO classes (course_id,lecturer_id,title,date)
       VALUES ($1,$2,'Live Class',$3)
       RETURNING id`,[courseId,uid,start]);

    req.session.currentLiveClassId = insert.rows[0].id;

    const { data } = await axios.post(
      'https://api.whereby.dev/v1/meetings',
      { roomNamePrefix:'edulearn', startDate:start.toISOString(),
        endDate:end.toISOString(), fields:['hostRoomUrl','roomUrl'] },
      { headers:{ Authorization:`Bearer ${WHEREBY_API_KEY}` } }
    );

    currentLiveRoomUrl = data.roomUrl;

    await q(
      `INSERT INTO recent_activity (icon,text,time,lecturer_id)
       VALUES ('fa-video','Started a new live class',NOW(),$1)`,[uid]);

    res.redirect('/dashboard/lecturer');
  }catch(e){ console.error(e); res.status(500).send('Live‑class error');}
});

/* ---------- end class ---------- */
router.post('/lecturer/end-class', requireLecturer, async (req,res)=>{
  try{
    currentLiveRoomUrl=null; req.session.currentLiveClassId=null;
    await q(
      `INSERT INTO recent_activity (icon,text,time,lecturer_id)
       VALUES ('fa-video-slash','Ended the live class',NOW(),$1)`,
      [req.session.user.id]);
    res.redirect('/dashboard/lecturer');
  }catch(e){ console.error(e); res.status(500).send('Error');}
});

/* ============== STUDENT SIDE  ============================== */
router.get('/student', requireStudent, async (req,res)=>{
  try{
    const uid=req.session.user.id;

    const { rows:[profile] } =
      await q(`SELECT name,email,department FROM users WHERE id=$1`,[uid]);

    const { rows:courses } = await q(
      `SELECT c.id,c.title,c.course_code,
              COALESCE(sc.progress,0)::int AS progress
         FROM student_courses sc
    LEFT JOIN courses c ON c.id=sc.course_id
        WHERE sc.student_id=$1`,[uid]);

    const courseIds = courses.map(c=>c.id);

    /* recordings */
    const { rows:recordings } = courseIds.length
      ? await q(
          `SELECT r.*, c.title AS course_title
             FROM recordings r
        LEFT JOIN courses c ON c.id=r.course_id
            WHERE r.course_id = ANY($1)
              AND r.shared_with_students=1
            ORDER BY r.uploaded_at DESC`,
          [courseIds])
      : { rows:[] };

    /* materials (for each course) */
    const { rows:mats } = courseIds.length
      ? await q(
          `SELECT id,title,file_url,type,course_id
             FROM materials WHERE course_id = ANY($1)`,
          [courseIds])
      : { rows:[] };

    courses.forEach(c=>{ c.materials=mats.filter(m=>m.course_id===c.id); });

    /* available courses to enrol */
    const { rows:available } = await q(
      `SELECT id,title,course_code
         FROM courses c
        WHERE (status='active' OR status IS NULL)
          AND NOT EXISTS (
              SELECT 1 FROM student_courses s
               WHERE s.student_id=$1 AND s.course_id=c.id)`,[uid]);

    /* upcoming */
    const { rows:upcoming } = courseIds.length
      ? await q(
          `SELECT id,title,date
             FROM classes
            WHERE course_id = ANY($1)
              AND date >= NOW()
            ORDER BY date`,[courseIds])
      : [];

    /* live class */
    let currentClassId=null, roomUrl=null;
    if(courseIds.length){
      const { rows:live } = await q(
        `SELECT id FROM classes
          WHERE course_id = ANY($1)
            AND date <= NOW()
            AND date + INTERVAL '2 hours' >= NOW()
          ORDER BY date DESC LIMIT 1`,[courseIds]);
      if(live.length){ currentClassId=live[0].id; roomUrl=currentLiveRoomUrl; }
    }

    res.render('dashboard/student',{
      user:req.session.user,
      stats:{ enrolled:courses.length, hours:24, attendance:85, grade:'A-' },
      courses, availableCourses:available,
      upcomingClasses:upcoming, materials:mats,
      recordings, currentClassId, roomUrl, profile
    });
  }catch(e){ console.error(e); res.status(500).send('Server error');}
});

/* enrol course */
router.post('/student/enroll', requireStudent, async (req,res)=>{
  try{
    const uid=req.session.user.id;
    const { course_id } = req.body;
    await q(
      `INSERT INTO student_courses (student_id,course_id,progress)
       VALUES ($1,$2,0)
       ON CONFLICT (student_id,course_id) DO NOTHING`,
      [uid,course_id]);
    res.redirect('/dashboard/student');
  }catch(e){ console.error(e); res.status(500).send('Enroll error'); }
});

/* mark material read */
router.post('/student/course/:course/material/:mat/read', requireStudent, async (req,res)=>{
  try{
    const uid=req.session.user.id;
    const { course, mat } = req.params;

    await q(
      `INSERT INTO course_material_reads (student_id,course_id,material_id)
       VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [uid,course,mat]);

    /* recalc progress */
    const { rows:[{total}] } = await q(
      `SELECT COUNT(*)::int AS total FROM materials WHERE course_id=$1`,[course]);

    const { rows:[{read}] } = await q(
      `SELECT COUNT(*)::int AS read FROM course_material_reads
        WHERE student_id=$1 AND course_id=$2`,[uid,course]);

    const pct = total ? Math.round(read/total*100) : 0;

    await q(
      `INSERT INTO student_courses (student_id,course_id,progress)
       VALUES ($1,$2,$3)
       ON CONFLICT (student_id,course_id)
       DO UPDATE SET progress=EXCLUDED.progress`,
      [uid,course,pct]);

    res.json({ success:true, percent:pct });
  }catch(e){ console.error(e); res.status(500).json({success:false}); }
});

/* ------------ logout (shared) ----------------------------- */
router.get('/auth/logout',(req,res)=>{
  req.session.destroy(err=>{
    if(err){ console.error(err); return res.status(500).send('Error'); }
    res.clearCookie('connect.sid'); res.redirect('/auth?mode=login');
  });
});

module.exports = router;
