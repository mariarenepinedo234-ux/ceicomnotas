import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers.js';
import {applyCatalog,keyOf} from '../catalog.js';
import {reviewedSubjectCatalog,updateReviewedSubjectCatalog} from '../subject-catalog-update.js';
import {reportData} from '../reports.js';

test('catálogo corregido actualiza 21 nombres, agrega 72 materias y conserva todos los vínculos y notas',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());const current=await reviewedSubjectCatalog();assert.equal(current.subjects.length,235);assert.deepEqual(current.teachers,[]);
  const legacy=current.subjects.filter(s=>!['ELECTRÓNICA','DISEÑO Y PRODUCCIÓN DE AUDIOVISUALES - GUIONIZACIÓN'].includes(s.career)).map(s=>({...s,name:s.previous_names?.[0]||s.name,previous_names:[]}));assert.equal(legacy.length,163);
  await applyCatalog(db,{careers:current.careers,subjects:legacy,teachers:[]});
  const corrected=await db.prepare("SELECT s.* FROM subjects s JOIN careers c ON c.id=s.career_id WHERE s.code='MCA-102' AND c.name LIKE 'COMERCIO%'").get();
  const student=(await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (NULL,'ESTUDIANTE DE PRUEBA','student',NULL)").run()).lastInsertRowid;
  await db.prepare('INSERT INTO students(user_id,career_id,shift_id,admission_year_id,level) VALUES (?,?,1,3,1)').run(student,corrected.career_id);
  const offering=(await db.query('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES ($1,4,1,2) RETURNING id',[corrected.id])).rows[0].id;
  await db.prepare('INSERT INTO enrollments(student_id,offering_id,saber,hacer,ser,grade) VALUES (?,?,30,30,15,75)').run(student,offering);
  const complementary=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES ('INFORMÁTICA (POWER BI)',1,3) RETURNING id")).rows[0].id;
  await db.prepare('UPDATE subjects SET active=false WHERE id=?').run(corrected.id);
  const before={};for(const table of ['users','students','offerings','enrollments','academic_groups','academic_group_students','teacher_directory'])before[table]=await db.query(`SELECT * FROM ${table} ORDER BY 1`).then(r=>r.rows);
  const officialIds=(await db.query('SELECT id,code,career_id,level FROM subjects WHERE code IS NOT NULL ORDER BY id')).rows;
  const count=(await db.prepare('SELECT count(*) n FROM subjects').get()).n;
  const updated=await updateReviewedSubjectCatalog(db);assert.equal(updated.subjects_updated,21);assert.equal(updated.subjects_created,72);assert.equal(updated.teachers_pending,0);
  for(const [table,rows] of Object.entries(before))assert.deepEqual((await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows,rows,table);
  for(const previous of officialIds)assert.deepEqual(await db.prepare('SELECT id,code,career_id,level FROM subjects WHERE id=?').get(previous.id),previous);
  assert.equal((await db.prepare('SELECT name,active FROM subjects WHERE id=?').get(corrected.id)).name,'METROLOGÍA Y CLASIFICACIÓN ARANCELARIA');assert.equal((await db.prepare('SELECT active FROM subjects WHERE id=?').get(corrected.id)).active,false);
  assert.equal((await reportData(db,offering)).offering.subject,'METROLOGÍA Y CLASIFICACIÓN ARANCELARIA');assert.equal((await reportData(db,offering)).rows[0].grade,75);
  assert.equal((await db.prepare('SELECT name FROM subjects WHERE id=?').get(complementary)).name,'INFORMÁTICA (POWER BI)');assert.equal((await db.prepare('SELECT count(*) n FROM subjects').get()).n,count+72);
  const rows=(await db.query('SELECT s.*,c.name career FROM subjects s JOIN careers c ON c.id=s.career_id')).rows;
  for(const s of current.subjects){const matches=rows.filter(r=>keyOf(r.career)===keyOf(s.career)&&r.level===s.level&&r.code===s.code);assert.equal(matches.length,1);assert.equal(matches[0].name,s.name);}
  const twice=await updateReviewedSubjectCatalog(db);assert.equal(twice.subjects_updated,0);assert.equal(twice.subjects_created,0);
});

test('una materia sin código con la escritura anterior se corrige conservando su identidad',async t=>{
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());await db.prepare('INSERT INTO careers(name) VALUES (?)').run('COMERCIO INTERNACIONAL');
  const career=await db.prepare('SELECT id FROM careers').get();const existing=(await db.query("INSERT INTO subjects(name,career_id,level) VALUES ('METROLOGÍAY CLASIFICACIÓN ARANCELARIA',$1,1) RETURNING id",[career.id])).rows[0].id;
  await updateReviewedSubjectCatalog(db);const subject=await db.prepare('SELECT * FROM subjects WHERE id=?').get(existing);assert.equal(subject.name,'METROLOGÍA Y CLASIFICACIÓN ARANCELARIA');assert.equal(subject.code,'MCA-102');assert.equal(subject.career_id,career.id);assert.equal((await db.prepare('SELECT COUNT(*) n FROM subjects').get()).n,235);
});
