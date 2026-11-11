import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {testDatabase} from './helpers.js';
import {reviewedSubjectCatalog,updateReviewedSubjectCatalog} from '../subject-catalog-update.js';
import {compareSubjects} from '../public/subject-order.js';

test('el catálogo y los selectores siguen el Excel en las nueve carreras, sin depender del ID o el nombre',async t=>{
  const db=await testDatabase();t.after(()=>db.cleanup());const original=await db.prepare('SELECT * FROM enrollments ORDER BY id').all();const catalog=await reviewedSubjectCatalog();await updateReviewedSubjectCatalog(db);
  const rows=(await db.query('SELECT s.*,c.name AS career FROM subjects s JOIN careers c ON c.id=s.career_id ORDER BY s.id DESC')).rows;
  for(const career of catalog.careers)for(const level of [1,2,3]){
    const expected=catalog.subjects.filter(s=>s.career===career&&s.level===level).map(s=>s.code);
    const actual=rows.filter(s=>s.career===career&&s.level===level).sort(compareSubjects);
    assert.deepEqual(actual.filter(s=>s.catalog_order!==null).map(s=>s.code),expected,career+' '+level);
    assert.ok(actual.slice(expected.length).every(s=>s.catalog_order===null));
  }
  const systems=rows.filter(s=>s.career==='SISTEMAS INFORMÁTICOS').sort(compareSubjects);assert.equal(systems[0].code,'HSA-101');assert.equal(systems.find(s=>s.id===1).code,'PRG-104');
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),original);
  // Simula una base ya existente con códigos asignados y orden aún sin migrar.
  await db.exec('UPDATE subjects SET catalog_order=NULL');
  const migration=await readFile(new URL('../migrations/006_subject_order.sql',import.meta.url),'utf8');await db.exec(migration.slice(migration.indexOf('WITH positions')));
  const restored=(await db.query('SELECT s.*,c.name AS career FROM subjects s JOIN careers c ON c.id=s.career_id')).rows;
  for(const career of catalog.careers)for(const level of [1,2,3])assert.deepEqual(restored.filter(s=>s.career===career&&s.level===level&&s.catalog_order!==null).sort(compareSubjects).map(s=>s.code),catalog.subjects.filter(s=>s.career===career&&s.level===level).map(s=>s.code));
});

test('sin posición de Excel se usa el año y la parte numérica del código, dejando complementarias sin código al final',()=>{
  const rows=[{id:1,career_id:1,level:3,code:'AAA-301'},{id:2,career_id:1,level:1,code:'AAA-103'},{id:3,career_id:1,level:1,code:'ZZZ-101'},{id:4,career_id:1,level:1,code:'BBB-102'},{id:5,career_id:1,level:1,code:null}];assert.deepEqual(rows.sort(compareSubjects).map(s=>s.id),[3,4,2,5,1]);
});
