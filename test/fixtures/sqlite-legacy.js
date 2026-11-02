import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword } from '../../lib.js';

export function openDatabase(path = process.env.DB_PATH || './data/ceicom.sqlite') {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, ci TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')), password TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, blocked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS careers (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS years (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, career_id INTEGER NOT NULL REFERENCES careers(id), level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3));
    CREATE TABLE IF NOT EXISTS modules (id INTEGER PRIMARY KEY, name TEXT NOT NULL, year_id INTEGER NOT NULL REFERENCES years(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL, UNIQUE(name,year_id));
    CREATE TABLE IF NOT EXISTS students (user_id INTEGER PRIMARY KEY REFERENCES users(id), career_id INTEGER NOT NULL REFERENCES careers(id), shift_id INTEGER NOT NULL REFERENCES shifts(id), admission_year_id INTEGER NOT NULL REFERENCES years(id), level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3));
    CREATE TABLE IF NOT EXISTS offerings (id INTEGER PRIMARY KEY, subject_id INTEGER NOT NULL REFERENCES subjects(id), module_id INTEGER NOT NULL REFERENCES modules(id), shift_id INTEGER NOT NULL REFERENCES shifts(id), teacher_id INTEGER NOT NULL REFERENCES users(id), unlocked_until TEXT, UNIQUE(subject_id,module_id,shift_id));
    CREATE TABLE IF NOT EXISTS enrollments (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(user_id), offering_id INTEGER NOT NULL REFERENCES offerings(id), grade REAL CHECK(grade BETWEEN 1 AND 100), updated_at TEXT, UNIQUE(student_id,offering_id));
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  `);
  // Migración aditiva: conserva las notas finales anteriores sin inventar su desglose.
  const columns = new Set(db.prepare('PRAGMA table_info(enrollments)').all().map(c => c.name));
  db.exec('BEGIN');
  try {
    // Los topes vigentes se validan en la API. El almacenamiento admite hasta
    // 100 para conservar, sin truncarlos, registros de escalas anteriores.
    for (const [name, max] of [['saber',100],['hacer',100],['ser',100]]) {
      if (!columns.has(name)) db.exec(`ALTER TABLE enrollments ADD COLUMN ${name} REAL CHECK(${name} BETWEEN 0 AND ${max})`);
    }
    const schema=db.prepare("SELECT sql FROM sqlite_master WHERE name='enrollments'").get().sql;
    if(/(?:saber|hacer|ser) BETWEEN 0 AND (?:30|45|25)\b/i.test(schema)) {
      db.exec(`CREATE TABLE enrollments_updated (
        id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(user_id),
        offering_id INTEGER NOT NULL REFERENCES offerings(id), grade REAL CHECK(grade BETWEEN 1 AND 100),
        updated_at TEXT, saber REAL CHECK(saber BETWEEN 0 AND 100),
        hacer REAL CHECK(hacer BETWEEN 0 AND 100), ser REAL CHECK(ser BETWEEN 0 AND 100),
        UNIQUE(student_id,offering_id));
        INSERT INTO enrollments_updated(id,student_id,offering_id,grade,updated_at,saber,hacer,ser)
          SELECT id,student_id,offering_id,grade,updated_at,saber,hacer,ser FROM enrollments;
        DROP TABLE enrollments;
        ALTER TABLE enrollments_updated RENAME TO enrollments;`);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) seed(db);
  return db;
}

function seed(db) {
  db.exec('BEGIN');
  try {
    const add = db.prepare('INSERT INTO users(ci,name,role,password,must_change) VALUES (?,?,?,?,?)');
    add.run('admin', 'María Pinedo', 'admin', hashPassword('Ceicom2026!'), 1);
    add.run('4567890', 'Carlos Mendoza', 'teacher', hashPassword('4567890'), 1);
    add.run('5678901', 'Lucía Vargas', 'teacher', hashPassword('5678901'), 1);
    const names = ['Valentina Rojas','Sebastián Flores','Camila Gutiérrez','Mateo Fernández','Isabella Quispe','Santiago Mamani','Luciana Castro','Nicolás Suárez'];
    names.forEach((name,i) => add.run(String(7000001+i), name, 'student', hashPassword(String(7000001+i)), 1));
    db.exec(`INSERT INTO careers(name) VALUES ('Sistemas Informáticos'),('Contaduría General'),('Secretariado Ejecutivo'),('Administración de Empresas'),('Comercio Internacional'),('Mercadotecnia'),('Diseño Gráfico'),('Electrónica'),('Diseño y Producción de Audiovisuales - Guionización');
      INSERT INTO shifts(name) VALUES ('Mañana'),('Tarde'),('Noche'),('Sábados');
      INSERT INTO years(name) VALUES ('2024'),('2025'),('2026');
      INSERT INTO subjects(name,career_id,level) VALUES ('Programación I',1,1),('Base de Datos I',1,1),('Diseño y Desarrollo Web',1,2),('Contabilidad Básica',2,1),('Ofimática',3,1);
      INSERT INTO modules(name,year_id,start_date,end_date) VALUES ('Módulo 1',3,'2026-01-01','2026-03-31'),('Módulo 2',3,'2026-04-01','2026-06-30'),('Módulo 3',3,'2026-07-01','2026-09-30'),('Módulo 4',3,'2026-10-01','2026-12-31');
      INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES (1,4,1,2),(2,4,1,2),(3,4,2,3),(4,4,1,3),(5,4,3,3),(1,3,1,2);
    `);
    const student = db.prepare('INSERT INTO students VALUES (?,?,?,?,?)');
    names.forEach((_,i) => student.run(i+4, i<5?1:i<7?2:3, i<7?1:3, 3, 1));
    const enroll = db.prepare('INSERT INTO enrollments(student_id,offering_id,grade) VALUES (?,?,?)');
    for (let i=4;i<=8;i++) { enroll.run(i,1,null); enroll.run(i,2,null); enroll.run(i,6,65+(i-4)*7); }
    enroll.run(9,4,null); enroll.run(10,4,null); enroll.run(11,5,null);
    db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (1,?,?)').run('Bienvenida','Entorno de demostración creado. Los nombres y registros son ficticios.');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
