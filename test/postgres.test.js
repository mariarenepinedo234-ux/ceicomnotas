import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testDatabase} from './helpers.js';
import {openDatabase,parameters,applicationTables,migrateDatabase} from '../db.js';
import {openDatabase as sqliteFixture} from './fixtures/sqlite-legacy.js';
import {importSqlite} from '../scripts/import-sqlite.js';
import {createAdmin} from '../scripts/admin.js';
import {seedDemo} from '../seed.js';
import {verifyPassword} from '../lib.js';
import {reportData} from '../reports.js';

test('PostgreSQL exige configuración y parametriza sin interpolar valores',async()=>{
  assert.equal(parameters("SELECT '?' text, ? value, 'no''?' other, ? next"),"SELECT '?' text, $1 value, 'no''?' other, $2 next");
  const configured=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
  try{await assert.rejects(openDatabase(),/Falta DATABASE_URL/);}finally{if(configured)process.env.DATABASE_URL=configured;}
});

test('base institucional vacía, administrador seguro y migraciones repetibles',async t=>{
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());
  for(const table of applicationTables)assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n,0);
  await migrateDatabase(db);await migrateDatabase(db);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM schema_migrations').get()).n,4);
  await assert.rejects(createAdmin(db,{ci:'administracion',name:'Administrador institucional',password:'Clave12'}),/8 a 160/);
  await createAdmin(db,{ci:'administracion',name:'Administrador institucional',password:'Clave123'});
  const admin=await db.prepare('SELECT * FROM users').get();assert.equal(admin.must_change,1);assert.equal(admin.role,'admin');assert.ok(verifyPassword('Clave123',admin.password));
  await assert.rejects(createAdmin(db,{ci:'otro',name:'Otro',password:'ClaveDePrueba2026!'}),/Ya existe/);
  assert.equal(await seedDemo(db),false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM subjects').get()).n,0);
  await db.prepare('UPDATE schema_migrations SET checksum=?').run('alterado');
  await assert.rejects(migrateDatabase(db),/modificada/);
});

test('las transacciones concurrentes no mezclan datos ni comparten rollback',async t=>{
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());
  await db.exec('CREATE TABLE transaction_probe (id INTEGER PRIMARY KEY, total INTEGER NOT NULL); INSERT INTO transaction_probe VALUES (1,0)');
  await Promise.all(Array.from({length:20},()=>db.transaction(async()=>{
    const row=await db.prepare('SELECT total FROM transaction_probe WHERE id=1 FOR UPDATE').get();
    await db.prepare('UPDATE transaction_probe SET total=? WHERE id=1').run(row.total+1);
  })));
  assert.equal((await db.prepare('SELECT total FROM transaction_probe WHERE id=1').get()).total,20);
  let started,release;
  const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  const failing=db.transaction(async()=>{await db.prepare('INSERT INTO careers(name) VALUES (?)').run('Se revierte');started();await gate;throw new Error('rollback deliberado');});
  await ready;
  await db.prepare('INSERT INTO careers(name) VALUES (?)').run('Se conserva');release();
  await assert.rejects(failing,/rollback deliberado/);
  assert.deepEqual((await db.prepare('SELECT name FROM careers').all()).map(r=>r.name),['Se conserva']);
});

test('importación SQLite íntegra, solo lectura, con contraseñas, notas, auditoría e identificadores',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ceicom-import-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const filename=join(dir,'source.sqlite'),old=sqliteFixture(filename);
  old.prepare('UPDATE enrollments SET saber=30,hacer=45,ser=25,grade=100 WHERE id=1').run();
  old.prepare('INSERT INTO sessions VALUES (?,?,?)').run('sesion-anterior',1,Date.now()+100000);
  const password=old.prepare('SELECT password FROM users WHERE id=1').get().password;
  const enrollments=old.prepare('SELECT * FROM enrollments ORDER BY id').all().map(r=>({...r}));
  old.close();const bytes=readFileSync(filename);
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());
  const counts=await importSqlite(db,filename);assert.equal(counts.users,11);assert.equal(counts.enrollments,18);
  assert.deepEqual(readFileSync(filename),bytes);
  assert.deepEqual(await db.prepare('SELECT * FROM enrollments ORDER BY id').all(),enrollments);
  assert.equal((await db.prepare('SELECT password FROM users WHERE id=1').get()).password,password);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sessions').get()).n,0);
  assert.equal((await reportData(db,1)).needs_review,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM audit').get()).n,counts.audit+1);
  const newUser=await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (?,?,'teacher',?)").run('nuevo','Nuevo docente',password);assert.ok(newUser.lastInsertRowid>11);
  await assert.rejects(importSqlite(db,filename),/no está vacía/);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM enrollments').get()).n,18);
});

test('importación fallida revierte todo y las notas anteriores sin desglose se conservan al reintentar',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'ceicom-import-old-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const filename=join(dir,'source.sqlite'),old=sqliteFixture(filename);
  for(const key of ['saber','hacer','ser'])old.exec(`ALTER TABLE enrollments DROP COLUMN ${key}`);
  old.exec("UPDATE modules SET start_date='2028-01-01' WHERE id=1");old.close();
  const db=await testDatabase({demo:false});t.after(()=>db.cleanup());
  await assert.rejects(importSqlite(db,filename));
  for(const table of applicationTables)assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n,0);
  const {DatabaseSync}=await import('node:sqlite');const fix=new DatabaseSync(filename);fix.exec("UPDATE modules SET start_date='2026-01-01' WHERE id=1");fix.close();
  await importSqlite(db,filename);
  const report=await reportData(db,6);assert.equal(report.legacy,5);assert.ok(report.rows.every(r=>r.grade!==null&&r.saber===null));
});
