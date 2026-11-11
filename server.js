import {saveRegisteredGroup,academicImpact,offeringRosterReview,updateOfferingRoster,editStudent,resetStudentPassword,deleteStudent,editModule,deleteModule} from './academic-admin.js';
import {readPlanUpload,listStudyPlans,createStudyPlan,studyPlanFile,deleteStudyPlan} from './study-plans.js';
import {academicUpper,uppercaseAcademicData} from './public/academic-text.js';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createBackupStore} from './backups.js';
import { readFile } from 'node:fs/promises';
import pathTools, { resolve, extname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './db.js';
import { hashPassword, verifyPassword, canGrade, deadlineFor, validGrade, dimensionGrades } from './lib.js';
import { reportData, renderPdf, renderExcel, reportFilename } from './reports.js';
import {parseCatalog,applyCatalog,activateTeacher} from './catalog.js';
import {updateStudentProfile} from './rosters.js';

const safeUser = u => ({ id:u.id, ci:u.ci, name:academicUpper(u.name), role:u.role, must_change:!!u.must_change, blocked:!!u.blocked });
const fail = (message, status=400) => { const e = new Error(message); e.status=status; throw e; };
const required = (v,label) => { if(typeof v!=='string' || !v.trim() || v.length>160) fail(`${label}: valor requerido (máximo 160 caracteres).`); return v.trim(); };
const number = v => { const n=Number(v); if(!Number.isInteger(n)||n<1) fail('Selecciona una opción válida.'); return n; };
const level = v => { const n=number(v); if(n>3) fail('El año debe estar entre 1 y 3.'); return n; };
const date = v => { if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v) fail('Fecha inválida.'); return v; };

export function staticFileTarget(pathname, paths = pathTools) {
  const root=paths.resolve('public');
  const target=paths.resolve(root,pathname==='/'?'index.html':'.'+pathname);
  const relative=paths.relative(root,target);
  if(!relative || relative==='..' || relative.startsWith('..'+paths.sep) || paths.isAbsolute(relative)) return null;
  return target;
}

export function createApp(db,{backupDirectory,backupNative=process.env.BACKUP_MODE==='docker'?false:'auto'}={}) {
  if(!db)throw new Error('Se requiere una conexión PostgreSQL inicializada.');
  const backups=createBackupStore({...db.backupConfig,directory:backupDirectory,native:backupNative});
  const attempts = new Map();
  const audit=async(id,action,detail)=>(await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(id,action,detail));
  const transaction=fn=>db.transaction(fn);
  return http.createServer(async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      const path=url.pathname;
      if(!path.startsWith('/api/')) {
        if(req.method!=='GET') fail('Método no permitido.',405);
        const target=staticFileTarget(path);
        if(!target) fail('Ruta inválida.',403);
          try { const content=await readFile(target); res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'})[extname(target)]||'application/octet-stream'});res.end(content); } catch { fail('Archivo no encontrado.',404); }
        return;
      }
      if(!['GET','POST'].includes(req.method)) fail('Método no permitido.',405);
      if(path==='/api/config'&&req.method==='GET')return send({demo:process.env.SEED_DEMO==='true'});
      if(req.method==='POST' && req.headers.origin && req.headers.origin!==`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`) fail('Origen no permitido.',403);
      let body={};
      if(req.method==='POST'&&path!=='/api/study-plans/upload') {
        let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>3*1024*1024) fail('Solicitud demasiado grande.',413); }
        try { body=JSON.parse(raw||'{}'); } catch { fail('JSON inválido.'); }
        if(!body || typeof body!=='object' || Array.isArray(body)) fail('Solicitud inválida.');
      }
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ceicom_session='))?.slice(15);
      const tokenHash=token?createHash('sha256').update(token).digest('hex'):'';
      let user=(await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.ci IS NOT NULL AND u.password IS NOT NULL').get(tokenHash,Date.now()));
      if(path==='/api/login' && req.method==='POST') {
        const key=req.socket.remoteAddress;
        const a=attempts.get(key); if(a && a.count>=15 && a.until>Date.now()) fail('Demasiados intentos. Intenta en 15 minutos.',429);
        const ci=required(body.ci,'Usuario'); const password=required(body.password,'Contraseña');
        const found=(await db.prepare('SELECT * FROM users WHERE ci=?').get(ci));
        if(!found || !verifyPassword(password,found.password)) { attempts.set(key,{count:(a?.until>Date.now()?a.count:0)+1,until:Date.now()+900000}); fail('Usuario o contraseña incorrectos.',401); }
        attempts.delete(key);
        const t=randomBytes(32).toString('hex');
        (await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()));
        (await db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(t).digest('hex'),found.id,Date.now()+8*3600000));
        res.setHeader('Set-Cookie',`ceicom_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);
        return send(safeUser(found));
      }
      if(!user) fail('Inicia sesión para continuar.',401);
      if(path==='/api/me') return send(safeUser(user));
      if(path==='/api/logout' && req.method==='POST') { (await db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash));res.setHeader('Set-Cookie','ceicom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send({ok:true}); }
      if(path==='/api/password' && req.method==='POST') {
        if(!verifyPassword(required(body.current,'Contraseña actual'),user.password)) fail('La contraseña actual es incorrecta.');
        const pw=required(body.password,'Contraseña nueva');
        if(pw.length<8 || pw===user.ci || pw===body.current) fail('Usa al menos 8 caracteres y una contraseña distinta del CI y la anterior.');
        await transaction(async()=>{(await db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(hashPassword(pw),user.id));(await db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,tokenHash));await audit(user.id,'Contraseña actualizada',user.name);});
        return send({ok:true});
      }
      if(user.must_change) fail('Cambia tu contraseña inicial para continuar.',403);
      if(path==='/api/study-plans'||path.startsWith('/api/study-plans/')){
        if(!['admin','teacher'].includes(user.role))fail('Acceso restringido.',403);
        if(path==='/api/study-plans'&&req.method==='GET')return send({plans:await listStudyPlans(db,url.searchParams)});
        if(path==='/api/study-plans/upload'&&req.method==='POST'){
          if(user.role!=='admin')fail('Solo administración puede subir planes.',403);
          return send(await createStudyPlan(db,await readPlanUpload(req),user.id),201);
        }
        const match=path.match(/^\/api\/study-plans\/([1-9]\d*)\/(file|delete)$/);
        if(match){
          const id=number(match[1]);if(id>2147483647)fail('Plan no encontrado.',404);
          if(match[2]==='file'&&req.method==='GET'){
            const plan=await studyPlanFile(db,id);
            const filename=`PLAN-${id}-${plan.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9-]+/g,'-').slice(0,80)}.pdf`;
            res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':plan.size_bytes,'Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="${filename}"`,'Cache-Control':'no-store'});
            res.end(plan.content);return;
          }
          if(match[2]==='delete'&&req.method==='POST'){
            if(user.role!=='admin')fail('Solo administración puede eliminar planes.',403);
            await deleteStudyPlan(db,id,user.id);return send({ok:true});
          }
        }
        fail('Ruta no encontrada.',404);
      }
      if(path==='/api/data' && req.method==='GET') {
        if(user.role==='student' && user.blocked) return send({blocked:true});
        const admin=user.role==='admin'; const teacher=user.role==='teacher';
        const offeringSql=`SELECT o.*, s.name subject, s.code subject_code, s.catalog_order, s.career_id, s.level, c.name career, m.name module, m.start_date, m.end_date, m.year_id, y.name AS "year", sh.name shift, u.name teacher FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id`;
        const offerings=admin?(await db.prepare(offeringSql).all()):teacher?(await db.prepare(offeringSql+' WHERE o.teacher_id=?').all(user.id)):(await db.prepare(offeringSql+' WHERE o.id IN (SELECT offering_id FROM enrollments WHERE student_id=?)').all(user.id));
        const enrollmentSql=`SELECT e.*,u.name student,u.ci FROM enrollments e JOIN users u ON u.id=e.student_id`;
        const enrollments=admin?(await db.prepare(enrollmentSql).all()):teacher?(await db.prepare(enrollmentSql+' JOIN offerings o ON o.id=e.offering_id WHERE o.teacher_id=?').all(user.id)):(await db.prepare(enrollmentSql+' WHERE e.student_id=?').all(user.id));
        return send(uppercaseAcademicData({
          offerings:offerings.map(o=>({...o,deadline:deadlineFor(o.end_date),can_grade:canGrade(o.end_date,o.unlocked_until)})),enrollments,
          careers:(await db.prepare('SELECT * FROM careers').all()),shifts:(await db.prepare('SELECT * FROM shifts').all()),years:(await db.prepare('SELECT * FROM years ORDER BY name DESC').all()),
          modules:(await db.prepare('SELECT m.*,y.name AS "year" FROM modules m JOIN years y ON y.id=m.year_id ORDER BY start_date').all()),
          subjects:admin?(await db.prepare('SELECT s.*,c.name career FROM subjects s JOIN careers c ON c.id=s.career_id').all()):[],
          students:admin?(await db.prepare('SELECT s.*,u.name,u.ci,u.blocked,c.name career,sh.name shift,y.name admission_year FROM students s JOIN users u ON u.id=s.user_id JOIN careers c ON c.id=s.career_id JOIN shifts sh ON sh.id=s.shift_id JOIN years y ON y.id=s.admission_year_id').all()):[],
          teachers:admin?(await db.prepare("SELECT id,name,ci FROM users WHERE role='teacher'").all()):[],
          teacher_directory:admin?(await db.prepare('SELECT id,name,user_id FROM teacher_directory ORDER BY name').all()):[],
          group_memberships:admin?(await db.prepare('SELECT * FROM academic_group_students ORDER BY group_id,student_id').all()):[],
          academic_groups:admin?(await db.prepare(`SELECT g.*,s.name subject,c.name career,ay.name admission_year,y.name AS "year",sh.name shift,o.teacher_id,u.name teacher,m.name module,
            (SELECT COUNT(*) FROM academic_group_students gs WHERE gs.group_id=g.id) student_count
            FROM academic_groups g JOIN subjects s ON s.id=g.subject_id JOIN careers c ON c.id=s.career_id
            JOIN years ay ON ay.id=g.admission_year_id JOIN years y ON y.id=g.year_id JOIN shifts sh ON sh.id=g.shift_id
            LEFT JOIN offerings o ON o.id=g.offering_id LEFT JOIN users u ON u.id=o.teacher_id LEFT JOIN modules m ON m.id=o.module_id ORDER BY g.id`).all()):[],
          audit:admin?(await db.prepare('SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 30').all()):[],
        }));
      }
      if(path.startsWith('/api/reports/') && req.method==='GET') {
        if(!['admin','teacher'].includes(user.role)) fail('Acceso restringido.',403);
        const id=number(path.slice('/api/reports/'.length));
        const report=await reportData(db,id);
        if(!report) fail('Materia no encontrada.',404);
        if(user.role==='teacher' && report.offering.teacher_id!==user.id) fail('No tienes esta materia asignada.',403);
        const format=url.searchParams.get('format')||'json';
        if(format==='json') return send(report);
        if(!['pdf','xlsx'].includes(format)) fail('Formato no disponible.');
        const draft=url.searchParams.get('draft')==='true';
        if(!report.rows.length || (report.pending&&!draft)) fail('Completa y guarda las notas finales de todos los estudiantes antes de exportar la planilla.',409);
        if(report.needs_review) fail('Hay notas de una escala anterior fuera de los límites actuales (40/40/20). Revísalas antes de exportar.',409);
        report.draft=draft;
        const buffer=await (format==='pdf'?renderPdf(report):renderExcel(report));
        await audit(user.id,draft?'Borrador de planilla exportado':'Planilla exportada',`${report.offering.subject} · ${report.offering.career} · ${format.toUpperCase()} · ${report.rows.length} estudiantes`);
        res.writeHead(200,{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${reportFilename(report,format)}"`,'Cache-Control':'no-store','Content-Length':buffer.length});
        return res.end(buffer);
      }
      if(path==='/api/grades' && req.method==='POST') {
        if(!['admin','teacher'].includes(user.role)) fail('Acceso restringido.',403);
        const offering=(await db.prepare('SELECT o.*,m.end_date FROM offerings o JOIN modules m ON m.id=o.module_id WHERE o.id=?').get(number(body.offering_id)));
        if(!offering) fail('Materia no encontrada.',404);
        if(user.role==='teacher' && offering.teacher_id!==user.id) fail('No tienes esta materia asignada.',403);
        if(user.role==='teacher' && !canGrade(offering.end_date,offering.unlocked_until)) fail('El plazo finalizó. Solicita una reapertura al administrador.',403);
        if(!Array.isArray(body.grades)||!body.grades.length) fail('No hay notas para guardar.');
        const items=body.grades.map(item=>{if(!item||typeof item!=='object')fail('Nota inválida.');return {...item,id:number(item.id)};}).sort((a,b)=>a.id-b.id);
        if(new Set(items.map(item=>item.id)).size!==items.length)fail('Una inscripción aparece más de una vez.');
        await transaction(async()=>{
          const current=await db.prepare('SELECT o.*,m.end_date FROM offerings o JOIN modules m ON m.id=o.module_id WHERE o.id=? FOR UPDATE OF o').get(offering.id);
          if(!current)fail('Materia no encontrada.',404);
          if(user.role==='teacher'&&(current.teacher_id!==user.id||!canGrade(current.end_date,current.unlocked_until)))fail('La asignación o el plazo cambiaron. Actualiza la página.',403);
          for(const item of items) {
          if(!item || typeof item!=='object') fail('Nota inválida.');
          const e=(await db.prepare('SELECT * FROM enrollments WHERE id=? AND offering_id=? FOR UPDATE').get(number(item.id),offering.id));
          if(!e) fail('Inscripción inválida.');
          let values;
          if(['saber','hacer','ser'].some(key=>Object.hasOwn(item,key))) {
            try { values=dimensionGrades(item); } catch(error) { fail(error.message); }
          } else {
            if(!validGrade(item.grade)) fail('Las notas deben ser números entre 1 y 100.');
            // Compatibilidad con registros de la primera versión: nunca deja un desglose inconsistente.
            values={saber:null,hacer:null,ser:null,grade:item.grade};
          }
          (await db.prepare("UPDATE enrollments SET saber=?,hacer=?,ser=?,grade=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(values.saber,values.hacer,values.ser,values.grade,e.id));
          await audit(user.id,values.grade===null?'Borrador de notas guardado':'Nota registrada',`Inscripción ${e.id}: ${e.grade??'pendiente'} → ${values.grade??'pendiente'}. Saber ${values.saber??'—'}, Hacer ${values.hacer??'—'}, Ser ${values.ser??'—'}`);
        }});return send({ok:true});
      }
      if(user.role!=='admin') fail('Acceso restringido.',403);
      if(path==='/api/backups'&&req.method==='GET')return send({backups:await backups.list()});
      if(path==='/api/backups'&&req.method==='POST'){
        const backup=await backups.create();
        await audit(user.id,'Copia de seguridad creada',`${backup.filename} · ${backup.size} bytes`);
        return send(backup,201);
      }
      if(path.startsWith('/api/backups/')&&req.method==='GET'){
        const backup=await backups.file(path.slice('/api/backups/'.length));
        await audit(user.id,'Copia de seguridad descargada',backup.filename);
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${backup.filename}"`,'Cache-Control':'no-store','Content-Length':backup.size});
        await pipeline(createReadStream(backup.path),res);return;
      }
      if(path==='/api/offering-roster'&&req.method==='GET')return send(await offeringRosterReview(db,number(url.searchParams.get('offering_id'))));
      if(path==='/api/academic-impact'&&req.method==='GET')return send(await academicImpact(db,url.searchParams.get('type'),number(url.searchParams.get('id'))));
      if(req.method!=='POST') fail('Ruta no encontrada.',404);
      const b=body;
      const administration={'/api/student-edit':editStudent,'/api/student-password-reset':resetStudentPassword,'/api/student-delete':deleteStudent,'/api/module-edit':editModule,'/api/module-delete':deleteModule,'/api/offering-roster':updateOfferingRoster};
      if(administration[path])return send(await administration[path](db,b,user.id));
      if(path==='/api/rosters'){
        return send(await saveRegisteredGroup(db,b,user.id));
      }
      if(path==='/api/student-profile'){
        try{await updateStudentProfile(db,{student_id:number(b.student_id),name:b.name,ci:b.ci,name_pending:b.name_pending===undefined?undefined:b.name_pending===true||b.name_pending==='true'},user.id);}catch(error){if(error.code)throw error;fail(error.message);}
        return send({ok:true});
      }
      if(path==='/api/catalog-excel/preview'){
        if(typeof b.file!=='string'||!b.file.length)fail('Selecciona un archivo Excel.');
        let payload;
        try{payload=await parseCatalog(Buffer.from(b.file,'base64'));}catch(error){fail(error.message);}
        const token=randomBytes(24).toString('hex'),digest=createHash('sha256').update(token).digest('hex');
        await db.prepare('DELETE FROM catalog_import_batches WHERE actor_id=? AND (expires_at<CURRENT_TIMESTAMP OR applied_at IS NOT NULL)').run(user.id);
        if((await db.prepare('SELECT COUNT(*) n FROM catalog_import_batches WHERE actor_id=?').get(user.id)).n>=5)fail('Tienes varias vistas previas abiertas. Espera 15 minutos o confirma una de ellas.');
        await db.prepare("INSERT INTO catalog_import_batches(token,actor_id,payload,expires_at) VALUES (?,?,?,CURRENT_TIMESTAMP+interval '15 minutes')").run(digest,user.id,JSON.stringify(payload));
        return send({token,...payload});
      }
      if(path==='/api/catalog-excel/apply'){
        const token=required(b.token,'Vista previa'),digest=createHash('sha256').update(token).digest('hex');
        let result;
        await transaction(async()=>{
          const batch=await db.prepare('SELECT * FROM catalog_import_batches WHERE token=? AND actor_id=? AND expires_at>CURRENT_TIMESTAMP FOR UPDATE').get(digest,user.id);
          if(!batch||batch.applied_at)fail('La vista previa venció o ya fue aplicada. Selecciona el archivo de nuevo.');
          try{result=await applyCatalog(db,batch.payload,user.id,{withinTransaction:true});}catch(error){if(error.code)throw error;fail(error.message);}
          await db.prepare('UPDATE catalog_import_batches SET applied_at=CURRENT_TIMESTAMP WHERE token=?').run(digest);
        });return send(result);
      }
      if(path==='/api/teacher-directory/activate'){
        try{await activateTeacher(db,{directory_id:number(b.directory_id),ci:b.ci},user.id);}catch(error){if(error.code)throw error;fail(error.message);}
        return send({ok:true});
      }
      if(path==='/api/users') {
        if(!['student','teacher'].includes(b.role)) fail('Rol inválido.');
        const ci=b.role==='student'&&(!b.ci||!String(b.ci).trim())?null:required(b.ci,'CI'); const name=academicUpper(required(b.name,'Nombre'));
        if(ci&&ci.length<5) fail('El CI debe tener al menos 5 caracteres.');
        await transaction(async()=>{const r=(await db.prepare('INSERT INTO users(ci,name,role,password) VALUES (?,?,?,?)').run(ci,name,b.role,ci?hashPassword(ci):null));
          if(b.role==='student') (await db.prepare('INSERT INTO students(user_id,career_id,shift_id,admission_year_id,level,name_pending) VALUES (?,?,?,?,?,?)').run(r.lastInsertRowid,number(b.career_id),number(b.shift_id),number(b.admission_year_id),level(b.level),b.name_pending===true||b.name_pending==='true'));
          await audit(user.id,'Usuario creado',`${name} · ${b.role==='student'?'Estudiante':'Docente'}`);
        });return send({ok:true});
      }
      if(path==='/api/catalog') {
        const name=academicUpper(required(b.name,'Nombre'));
        const tables={career:'careers',shift:'shifts',year:'years'};
        if(!tables[b.type]) fail('Catálogo inválido.');
        if(b.type==='year' && !/^20\d{2}$/.test(name)) fail('La gestión debe ser un año entre 2000 y 2099.');
        await transaction(async()=>{(await db.prepare(`INSERT INTO ${tables[b.type]}(name) VALUES (?)`).run(name));await audit(user.id,'Catálogo actualizado',name);});return send({ok:true});
      }
      if(path==='/api/subjects') {
        const name=academicUpper(required(b.name,'Materia')),careerId=number(b.career_id),yearLevel=level(b.level);
        const code=typeof b.code==='string'&&b.code.trim()?b.code.trim().toUpperCase():null;
        if(code&&!/^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(code))fail('Código inválido (máximo 40 letras, números, guion, punto o barra).');
        const active=b.active===undefined||b.active===true||b.active==='true';
        await transaction(async()=>{
          if(b.id){
            const old=await db.prepare('SELECT * FROM subjects WHERE id=? FOR UPDATE').get(number(b.id));if(!old)fail('Materia no encontrada.');
            if((old.career_id!==careerId||old.level!==yearLevel)&&await db.prepare('SELECT id FROM offerings WHERE subject_id=? LIMIT 1').get(old.id))fail('La materia tiene asignaciones. Conserva su carrera y año; crea una nueva para otro plan de estudios.');
            await db.prepare('UPDATE subjects SET name=?,code=?,career_id=?,level=?,active=? WHERE id=?').run(name,code,careerId,yearLevel,active,old.id);
            await audit(user.id,'Materia actualizada',`${old.id}: ${old.code||'sin código'} · ${old.name} → ${code||'sin código'} · ${name}; ${active?'activa':'inactiva'}`);
          }else{
            await db.prepare('INSERT INTO subjects(name,career_id,level,code,active) VALUES (?,?,?,?,?)').run(name,careerId,yearLevel,code,active);
            await audit(user.id,'Materia creada',`${code||'Sin código'} · ${name}`);
          }
        });return send({ok:true});
      }
      if(path==='/api/modules') {
        const start=date(b.start_date),end=date(b.end_date);if(start>end) fail('El fin debe ser posterior al inicio.');
        const yearId=number(b.year_id);
        await transaction(async()=>{
          const year=await db.prepare('SELECT name FROM years WHERE id=? FOR UPDATE').get(yearId);
          if(!year||start.slice(0,4)!==year.name||end.slice(0,4)!==year.name)fail('Las fechas deben pertenecer a la gestión.');
          if((await db.prepare('SELECT count(*) n FROM modules WHERE year_id=?').get(yearId)).n>=4)fail('Cada gestión admite hasta cuatro módulos.');
          if(await db.prepare('SELECT id FROM modules WHERE year_id=? AND start_date<=? AND end_date>=?').get(yearId,end,start))fail('El módulo se superpone con otro de la misma gestión.');
          await db.prepare('INSERT INTO modules(name,year_id,start_date,end_date) VALUES (?,?,?,?)').run(academicUpper(required(b.name,'Módulo')),yearId,start,end);
          await audit(user.id,'Módulo creado',b.name);
        });return send({ok:true});
      }
      if(path==='/api/offerings') {
        const teacher=number(b.teacher_id);if(!(await db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(teacher))) fail('Docente inválido.');
        const subjectId=number(b.subject_id),careerId=number(b.career_id);
        const subject=(await db.prepare('SELECT career_id,active FROM subjects WHERE id=?').get(subjectId));
        if(!subject||subject.career_id!==careerId) fail('La materia debe pertenecer a la carrera seleccionada.');
        if(!subject.active)fail('La materia está inactiva. Habilítala en el catálogo para asignarla.');
        await transaction(async()=>{(await db.prepare('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES (?,?,?,?)').run(subjectId,number(b.module_id),number(b.shift_id),teacher));await audit(user.id,'Asignación docente creada',`Docente ${teacher} · carrera ${careerId} · materia ${subjectId}`);});return send({ok:true});
      }
      if(path==='/api/enrollments') {
        await transaction(async()=>{
          const studentId=number(b.student_id),offeringId=number(b.offering_id);
          const o=await db.prepare('SELECT o.*,s.career_id,s.level FROM offerings o JOIN subjects s ON s.id=o.subject_id WHERE o.id=? FOR UPDATE OF o').get(offeringId);
          const s=await db.prepare('SELECT * FROM students WHERE user_id=? FOR UPDATE').get(studentId);
          if(!s||!o)fail('Estudiante o materia inválidos.');
          if(s.career_id!==o.career_id||s.shift_id!==o.shift_id||s.level!==o.level)fail('La materia debe coincidir con la carrera, turno y año actual del estudiante.');
          const group=await db.prepare('SELECT * FROM academic_groups WHERE offering_id=?').get(o.id);
          if(group&&group.admission_year_id!==s.admission_year_id)fail('El estudiante pertenece a otro ingreso. Revisa el grupo académico.');
          await db.prepare('INSERT INTO enrollments(student_id,offering_id) VALUES (?,?)').run(s.user_id,o.id);
          if(group)await db.prepare('INSERT INTO academic_group_students(group_id,student_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(group.id,s.user_id);
          await audit(user.id,'Inscripción realizada',`Estudiante ${s.user_id} · asignación ${o.id}`);
        });return send({ok:true});
      }
      if(path==='/api/student-status') {
        const s=(await db.prepare('SELECT * FROM students WHERE user_id=?').get(number(b.student_id)));if(!s) fail('Estudiante no encontrado.');
        if(typeof b.blocked!=='boolean') fail('Estado inválido.');
        await transaction(async()=>{(await db.prepare('UPDATE users SET blocked=? WHERE id=?').run(b.blocked?1:0,s.user_id));await audit(user.id,b.blocked?'Consulta suspendida':'Consulta habilitada',`Estudiante ${s.user_id} · gestión manual de pagos`);});return send({ok:true});
      }
      if(path==='/api/transfer') {
        const studentId=number(b.student_id),shift=number(b.shift_id),nextLevel=level(b.level),reason=required(b.reason,'Motivo');
        await transaction(async()=>{
          const s=await db.prepare('SELECT * FROM students WHERE user_id=? FOR UPDATE').get(studentId);
          if(!s)fail('Estudiante no encontrado.');
          await db.prepare('UPDATE students SET shift_id=?,level=? WHERE user_id=?').run(shift,nextLevel,s.user_id);
          await audit(user.id,'Traslado / actualización académica',`Estudiante ${s.user_id}: turno ${s.shift_id} → ${shift}, año ${s.level} → ${nextLevel}. ${reason}. Historial conservado.`);
        });return send({ok:true});
      }
      if(path==='/api/unlock') {
        const id=number(b.offering_id),reason=required(b.reason,'Motivo');
        const o=(await db.prepare('SELECT id FROM offerings WHERE id=?').get(id));if(!o) fail('Materia no encontrada.');
        const hours=number(b.hours);if(hours>168) fail('La reapertura admite un máximo de 168 horas.');
        const until=new Date(Date.now()+hours*3600000).toISOString();
        await transaction(async()=>{(await db.prepare('UPDATE offerings SET unlocked_until=? WHERE id=?').run(until,id));await audit(user.id,'Plazo reabierto',`Asignación ${id} hasta ${until}. ${reason}`);});return send({ok:true});
      }
      fail('Ruta no encontrada.',404);
    } catch(e) {
      if(res.headersSent){res.destroy();return;}
      if(['23505','23503','23514','23P01','22007','22008'].includes(e.code)) return send({error:e.code==='23505'?'Este registro ya existe. Revisa los datos.':'La operación no es válida. Revisa las relaciones y los datos seleccionados.'},409);
      if(!e.status) console.error('Error interno del servidor',{code:e.code||'INTERNAL'});
      send({error:e.status?e.message:'Ocurrió un error interno.'},e.status||500);
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const db=await openDatabase();
  if(process.env.SEED_DEMO==='true'){const {seedDemo}=await import('./seed.js');await seedDemo(db);}
  const server=createApp(db);const port=Number(process.env.PORT||3000);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
  server.listen(port,'0.0.0.0',()=>console.log(`Ceicom iniciado en el puerto ${port}. Base PostgreSQL conectada.`));
}
