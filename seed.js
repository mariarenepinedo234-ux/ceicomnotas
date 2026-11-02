import {hashPassword} from './lib.js';
import {requireEmptyDatabase,resetSequences} from './db.js';
export async function seedDemo(db){
  return db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202603)');
    if(await db.prepare('SELECT id FROM users LIMIT 1').get())return false;
    await requireEmptyDatabase(db);await resetSequences(db);

    const add = db.prepare('INSERT INTO users(ci,name,role,password,must_change) VALUES (?,?,?,?,?)');
    await add.run('admin', 'María Pinedo', 'admin', hashPassword('Ceicom2026!'), 1);
    await add.run('4567890', 'Carlos Mendoza', 'teacher', hashPassword('4567890'), 1);
    await add.run('5678901', 'Lucía Vargas', 'teacher', hashPassword('5678901'), 1);
    const names = ['Valentina Rojas','Sebastián Flores','Camila Gutiérrez','Mateo Fernández','Isabella Quispe','Santiago Mamani','Luciana Castro','Nicolás Suárez'];
    for(const [i,name] of names.entries())await add.run(String(7000001+i), name, 'student', hashPassword(String(7000001+i)), 1);
    await db.exec(`INSERT INTO careers(name) VALUES ('Sistemas Informáticos'),('Contaduría General'),('Secretariado Ejecutivo'),('Administración de Empresas'),('Comercio Internacional'),('Mercadotecnia'),('Diseño Gráfico'),('Electrónica'),('Diseño y Producción de Audiovisuales - Guionización');
      INSERT INTO shifts(name) VALUES ('Mañana'),('Tarde'),('Noche'),('Sábados');
      INSERT INTO years(name) VALUES ('2024'),('2025'),('2026');
      INSERT INTO subjects(name,career_id,level) VALUES ('Programación I',1,1),('Base de Datos I',1,1),('Diseño y Desarrollo Web',1,2),('Contabilidad Básica',2,1),('Ofimática',3,1);
      INSERT INTO modules(name,year_id,start_date,end_date) VALUES ('Módulo 1',3,'2026-01-01','2026-03-31'),('Módulo 2',3,'2026-04-01','2026-06-30'),('Módulo 3',3,'2026-07-01','2026-09-30'),('Módulo 4',3,'2026-10-01','2026-12-31');
      INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES (1,4,1,2),(2,4,1,2),(3,4,2,3),(4,4,1,3),(5,4,3,3),(1,3,1,2);
    `);
    const student = db.prepare('INSERT INTO students VALUES (?,?,?,?,?)');
    for(let i=0;i<names.length;i++)await student.run(i+4, i<5?1:i<7?2:3, i<7?1:3, 3, 1);
    const enroll = db.prepare('INSERT INTO enrollments(student_id,offering_id,grade) VALUES (?,?,?)');
    for (let i=4;i<=8;i++) { await enroll.run(i,1,null); await enroll.run(i,2,null); await enroll.run(i,6,65+(i-4)*7); }
    await enroll.run(9,4,null); await enroll.run(10,4,null); await enroll.run(11,5,null);
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (1,?,?)').run('Bienvenida','Entorno de demostración creado. Los nombres y registros son ficticios.');

    return true;
  });
}
