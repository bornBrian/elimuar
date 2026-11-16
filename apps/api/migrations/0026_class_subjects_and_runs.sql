-- Classes are a form and stream; what they study is now its own table.
-- Every activity run is now recorded, so reports have real history.
-- Non-destructive: nothing is deleted; old columns and tables are left as they are.
--
--   node scripts/apply-migration.mjs migrations/0026_class_subjects_and_runs.sql

CREATE TABLE IF NOT EXISTS class_subjects (
  id varchar(36) NOT NULL DEFAULT (uuid()),
  school_id varchar(36) NOT NULL,
  class_id varchar(36) NOT NULL,
  subject varchar(80) NOT NULL,
  all_students boolean NOT NULL DEFAULT true,
  created_at datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  UNIQUE KEY class_subjects_class_subject (class_id, subject),
  KEY class_subjects_school_idx (school_id),
  CONSTRAINT class_subjects_school_id_schools_id_fk FOREIGN KEY (school_id) REFERENCES schools (id) ON DELETE CASCADE,
  CONSTRAINT class_subjects_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_subjects (
  id varchar(36) NOT NULL DEFAULT (uuid()),
  class_subject_id varchar(36) NOT NULL,
  student_id varchar(36) NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  UNIQUE KEY student_subjects_unique (class_subject_id, student_id),
  CONSTRAINT student_subjects_class_subject_id_class_subjects_id_fk FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id) ON DELETE CASCADE,
  CONSTRAINT student_subjects_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ar_activity_runs (
  id varchar(36) NOT NULL DEFAULT (uuid()),
  run_id varchar(64) NOT NULL,
  user_id varchar(36) NOT NULL,
  school_id varchar(36) NULL,
  class_id varchar(36) NULL,
  activity_key varchar(60) NOT NULL,
  assignment_id varchar(36) NULL,
  status enum('not_started','in_progress','completed','mastered') NOT NULL DEFAULT 'in_progress',
  questions_shown int NOT NULL DEFAULT 0,
  questions_correct int NOT NULL DEFAULT 0,
  score_percent decimal(5,2) NULL,
  duration_seconds int NOT NULL DEFAULT 0,
  end_reason varchar(20) NULL,
  answers json NULL,
  started_at datetime(3) NULL,
  played_at datetime(3) NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
  updated_at datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  UNIQUE KEY ar_activity_runs_user_run (user_id, run_id),
  KEY ar_activity_runs_school_idx (school_id, played_at),
  KEY ar_activity_runs_class_idx (class_id),
  KEY ar_activity_runs_assignment_idx (assignment_id),
  CONSTRAINT ar_activity_runs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT ar_activity_runs_school_id_schools_id_fk FOREIGN KEY (school_id) REFERENCES schools (id) ON DELETE SET NULL,
  CONSTRAINT ar_activity_runs_class_id_classes_id_fk FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE SET NULL,
  CONSTRAINT ar_activity_runs_assignment_id_lesson_assignments_id_fk FOREIGN KEY (assignment_id) REFERENCES lesson_assignments (id) ON DELETE SET NULL
);

-- A teacher may teach several subjects in one class; each class subject has one teacher.
ALTER TABLE teacher_assignments ADD INDEX teacher_assignments_teacher_idx (teacher_id);
ALTER TABLE teacher_assignments DROP INDEX teacher_assignments_unique;
CREATE UNIQUE INDEX teacher_assignments_class_subject ON teacher_assignments (class_id, subject);

-- The subject catalogue: the O-level subjects; the earlier placeholders are retired.
INSERT IGNORE INTO subjects (id, name) VALUES
  (uuid(), 'Basic Mathematics'), (uuid(), 'English Language'), (uuid(), 'Kiswahili'), (uuid(), 'Biology'),
  (uuid(), 'Chemistry'), (uuid(), 'Physics'), (uuid(), 'Geography'), (uuid(), 'History'), (uuid(), 'Civics'),
  (uuid(), 'Computer Science'), (uuid(), 'Literature in English'), (uuid(), 'Book-keeping'), (uuid(), 'Commerce');
UPDATE subjects SET status = 'archived'
  WHERE name IN ('ICT', 'Information and Computer Studies', 'Digital Literacy', 'General Science', 'Technical');

-- Every class studies the core subjects; Computer Science is optional.
INSERT IGNORE INTO class_subjects (id, school_id, class_id, subject, all_students)
  SELECT uuid(), c.school_id, c.id, s.name, true
  FROM classes c
  JOIN subjects s ON s.name IN ('Basic Mathematics', 'English Language', 'Kiswahili', 'Biology', 'Chemistry',
                                'Physics', 'Geography', 'History', 'Civics')
  WHERE c.status = 'active';
INSERT IGNORE INTO class_subjects (id, school_id, class_id, subject, all_students)
  SELECT uuid(), c.school_id, c.id, 'Computer Science', false FROM classes c WHERE c.status = 'active';

-- Those already in a Computer Science class keep taking it (the head can change this).
INSERT IGNORE INTO student_subjects (id, class_subject_id, student_id)
  SELECT uuid(), cs.id, e.student_id
  FROM class_subjects cs
  JOIN student_enrollments e ON e.class_id = cs.class_id AND e.status = 'active'
  WHERE cs.subject = 'Computer Science';

-- The demonstration school's teachers, by subject (as the seed sets them).
INSERT IGNORE INTO teacher_assignments (id, teacher_id, class_id, subject)
  SELECT uuid(), ta.teacher_id, ta.class_id, 'Biology'
  FROM teacher_assignments ta WHERE ta.subject = 'Computer Science';
INSERT IGNORE INTO teacher_assignments (id, teacher_id, class_id, subject)
  SELECT uuid(), u.id, c.id, x.subject
  FROM users u
  JOIN memberships m ON m.user_id = u.id AND m.role = 'teacher'
  JOIN classes c ON c.school_id = m.school_id AND c.status = 'active'
  JOIN (SELECT 'Physics' subject UNION ALL SELECT 'Basic Mathematics') x
  WHERE u.first_name = 'Peter' AND u.last_name = 'Magesa';
INSERT IGNORE INTO teacher_assignments (id, teacher_id, class_id, subject)
  SELECT uuid(), u.id, c.id, 'Chemistry'
  FROM users u
  JOIN memberships m ON m.user_id = u.id AND m.role = 'teacher'
  JOIN classes c ON c.school_id = m.school_id AND c.status = 'active'
  WHERE u.first_name = 'Asha' AND u.last_name = 'Mkumbo';

-- Where the activities sit in the syllabus.
UPDATE ar_activities SET subject = 'Biology', grade_level = 'Form 3' WHERE activity_key IN ('circulatorysystem', 'humaneye');
UPDATE ar_activities SET subject = 'Biology', grade_level = 'Form 2' WHERE activity_key = 'respiratorysystem';
UPDATE lessons l JOIN ar_activities a ON a.lesson_id = l.id SET l.subject = a.subject, l.grade_level = a.grade_level;

-- Each learner's latest run, from the summary rows kept so far.
INSERT IGNORE INTO ar_activity_runs
  (id, run_id, user_id, school_id, class_id, activity_key, status, questions_shown, questions_correct,
   score_percent, duration_seconds, played_at)
  SELECT uuid(), coalesce(s.last_run_id, concat('summary-', s.id)), s.user_id, e.school_id, e.class_id, s.activity_key,
         s.status, s.questions_shown, s.questions_correct,
         CASE WHEN s.questions_shown > 0 THEN s.latest_score_percent END,
         coalesce(s.last_duration_seconds, 0), s.last_played_at
  FROM ar_activity_states s
  LEFT JOIN student_enrollments e ON e.student_id = s.user_id AND e.status = 'active'
  WHERE s.last_played_at IS NOT NULL;

-- Hand-ins made before runs were recorded: attach them to their run, with the answers.
UPDATE ar_activity_runs r
  JOIN lessons l ON l.model_key = r.activity_key
  JOIN practice_sessions ps ON ps.student_id = r.user_id AND ps.lesson_id = l.id
                            AND ps.assignment_id IS NOT NULL AND ps.finished_at = r.played_at
  JOIN submissions sub ON sub.session_id = ps.id
  SET r.assignment_id = ps.assignment_id,
      r.end_reason = 'finished',
      r.started_at = ps.started_at,
      r.duration_seconds = round(ps.duration_ms / 1000),
      r.answers = (
        SELECT json_arrayagg(json_object('prompt', si.prompt, 'chosen', si.student_response,
                                         'answer', si.model_answer, 'correct', si.is_correct = 1))
        FROM submission_items si WHERE si.submission_id = sub.id AND si.ref <> 'Note'
      );
