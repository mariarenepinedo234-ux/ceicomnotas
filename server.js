import http from 'node:http';
import { readFile } from 'node:fs/promises';
import pathTools, { resolve, extname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './db.js';
import { hashPassword, verifyPassword, canGrade, deadlineFor, validGrade, dimensionGrades } from './lib.js';
import { reportData, renderPdf, renderExcel, reportFilename } from './reports.js';

const safeUser = u => ({ id:u.id, ci:u.ci, name:u.name, role:u.role, must_change:!!u.must_change, blocked:!!u.blocked });
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

export function createApp(db = openDatabase()) {
  const attempts = new Map();
  const audit=(id,action,detail)=>db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(id,action,detail);
  const transaction=fn=>{db.exec('BEGIN'); try { const r=fn();db.exec('COMMIT');return r;} catch(e){db.exec('ROLLBACK');throw e;}};
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
        try { const content=await readFile(target); res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'})[extname(target)]||'application/octet-stream'});res.end(content); } catch { fail('Archivo no encontrado.',404); }
        return;
      }
      if(!['GET','POST'].includes(req.method)) fail('Método no permitido.',405);
      if(req.method==='POST' && req.headers.origin && req.headers.origin!==`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host}`) fail('Origen no permitido.',403);
      let body={};
      if(req.method==='POST') {
        let raw=''; for await(const chunk of req) { raw+=chunk; if(Buffer.byteLength(raw)>100000) fail('Solicitud demasiado grande.',413); }
        try { body=JSON.parse(raw||'{}'); } catch { fail('JSON inválido.'); }
        if(!body || typeof body!=='object' || Array.isArray(body)) fail('Solicitud inválida.');
      }
      const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ceicom_session='))?.slice(15);
      const tokenHash=token?createHash('sha256').update(token).digest('hex'):'';
      let user=db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(tokenHash,Date.now());
      if(path==='/api/login' && req.method==='POST') {
        const key=req.socket.remoteAddress;
        const a=attempts.get(key); if(a && a.count>=15 && a.until>Date.now()) fail('Demasiados intentos. Intenta en 15 minutos.',429);
        const ci=required(body.ci,'Usuario'); const password=required(body.password,'Contraseña');
        const found=db.prepare('SELECT * FROM users WHERE ci=?').get(ci);
        if(!found || !verifyPassword(password,found.password)) { attempts.set(key,{count:(a?.until>Date.now()?a.count:0)+1,until:Date.now()+900000}); fail('Usuario o contraseña incorrectos.',401); }
        attempts.delete(key);
        const t=randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(createHash('sha256').update(t).digest('hex'),found.id,Date.now()+8*3600000);
        res.setHeader('Set-Cookie',`ceicom_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);
        return send(safeUser(found));
      }
      if(!user) fail('Inicia sesión para continuar.',401);
      if(path==='/api/me') return send(safeUser(user));
      if(path==='/api/logout' && req.method==='POST') { db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash);res.setHeader('Set-Cookie','ceicom_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return send({ok:true}); }
      if(path==='/api/password' && req.method==='POST') {
        if(!verifyPassword(required(body.current,'Contraseña actual'),user.password)) fail('La contraseña actual es incorrecta.');
        const pw=required(body.password,'Contraseña nueva');
        if(pw.length<10 || pw===user.ci || pw===body.current) fail('Usa al menos 10 caracteres y una contraseña distinta del CI y la anterior.');
        transaction(()=>{db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(hashPassword(pw),user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,tokenHash);audit(user.id,'Contraseña actualizada',user.name);});
        return send({ok:true});
      }
      if(user.must_change) fail('Cambia tu contraseña inicial para continuar.',403);
      if(path==='/api/data' && req.method==='GET') {
        if(user.role==='student' && user.blocked) return send({blocked:true});
        const admin=user.role==='admin'; const teacher=user.role==='teacher';
        const offeringSql=`SELECT o.*, s.name subject, s.career_id, s.level, c.name career, m.name module, m.start_date, m.end_date, m.year_id, y.name year, sh.name shift, u.name teacher FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN careers c ON c.id=s.career_id JOIN modules m ON m.id=o.module_id JOIN years y ON y.id=m.year_id JOIN shifts sh ON sh.id=o.shift_id JOIN users u ON u.id=o.teacher_id`;
        const offerings=admin?db.prepare(offeringSql).all():teacher?db.prepare(offeringSql+' WHERE o.teacher_id=?').all(user.id):db.prepare(offeringSql+' WHERE o.id IN (SELECT offering_id FROM enrollments WHERE student_id=?)').all(user.id);
        const enrollmentSql=`SELECT e.*,u.name student,u.ci FROM enrollments e JOIN users u ON u.id=e.student_id`;
        const enrollments=admin?db.prepare(enrollmentSql).all():teacher?db.prepare(enrollmentSql+' JOIN offerings o ON o.id=e.offering_id WHERE o.teacher_id=?').all(user.id):db.prepare(enrollmentSql+' WHERE e.student_id=?').all(user.id);
        return send({
          offerings:offerings.map(o=>({...o,deadline:deadlineFor(o.end_date),can_grade:canGrade(o.end_date,o.unlocked_until)})),enrollments,
          careers:db.prepare('SELECT * FROM careers').all(),shifts:db.prepare('SELECT * FROM shifts').all(),years:db.prepare('SELECT * FROM years ORDER BY name DESC').all(),
          modules:db.prepare('SELECT m.*,y.name year FROM modules m JOIN years y ON y.id=m.year_id ORDER BY start_date').all(),
          subjects:admin?db.prepare('SELECT s.*,c.name career FROM subjects s JOIN careers c ON c.id=s.career_id').all():[],
          students:admin?db.prepare('SELECT s.*,u.name,u.ci,u.blocked,c.name career,sh.name shift,y.name admission_year FROM students s JOIN users u ON u.id=s.user_id JOIN careers c ON c.id=s.career_id JOIN shifts sh ON sh.id=s.shift_id JOIN years y ON y.id=s.admission_year_id').all():[],
          teachers:admin?db.prepare("SELECT id,name,ci FROM users WHERE role='teacher'").all():[],
          audit:admin?db.prepare('SELECT a.*,u.name actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 30').all():[],
        });
      }
      if(path.startsWith('/api/reports/') && req.method==='GET') {
        if(!['admin','teacher'].includes(user.role)) fail('Acceso restringido.',403);
        const id=number(path.slice('/api/reports/'.length));
        const report=reportData(db,id);
        if(!report) fail('Materia no encontrada.',404);
        if(user.role==='teacher' && report.offering.teacher_id!==user.id) fail('No tienes esta materia asignada.',403);
        const format=url.searchParams.get('format')||'json';
        if(format==='json') return send(report);
        if(!['pdf','xlsx'].includes(format)) fail('Formato no disponible.');
        if(!report.rows.length || report.pending) fail('Completa y guarda las notas finales de todos los estudiantes antes de exportar la planilla.',409);
        if(report.needs_review) fail('Hay notas de una escala anterior fuera de los límites actuales (40/40/20). Revísalas antes de exportar.',409);
        const buffer=await (format==='pdf'?renderPdf(report):renderExcel(report));
        audit(user.id,'Planilla exportada',`${report.offering.subject} · ${report.offering.career} · ${format.toUpperCase()} · ${report.rows.length} estudiantes`);
        res.writeHead(200,{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${reportFilename(report,format)}"`,'Cache-Control':'no-store','Content-Length':buffer.length});
        return res.end(buffer);
      }
      if(path==='/api/grades' && req.method==='POST') {
        if(!['admin','teacher'].includes(user.role)) fail('Acceso restringido.',403);
        const offering=db.prepare('SELECT o.*,m.end_date FROM offerings o JOIN modules m ON m.id=o.module_id WHERE o.id=?').get(number(body.offering_id));
        if(!offering) fail('Materia no encontrada.',404);
        if(user.role==='teacher' && offering.teacher_id!==user.id) fail('No tienes esta materia asignada.',403);
        if(user.role==='teacher' && !canGrade(offering.end_date,offering.unlocked_until)) fail('El plazo finalizó. Solicita una reapertura al administrador.',403);
        if(!Array.isArray(body.grades)||!body.grades.length) fail('No hay notas para guardar.');
        transaction(()=>{for(const item of body.grades) {
          if(!item || typeof item!=='object') fail('Nota inválida.');
          const e=db.prepare('SELECT * FROM enrollments WHERE id=? AND offering_id=?').get(number(item.id),offering.id);
          if(!e) fail('Inscripción inválida.');
          let values;
          if(['saber','hacer','ser'].some(key=>Object.hasOwn(item,key))) {
            try { values=dimensionGrades(item); } catch(error) { fail(error.message); }
          } else {
            if(!validGrade(item.grade)) fail('Las notas deben ser números entre 1 y 100.');
            // Compatibilidad con registros de la primera versión: nunca deja un desglose inconsistente.
            values={saber:null,hacer:null,ser:null,grade:item.grade};
          }
          db.prepare("UPDATE enrollments SET saber=?,hacer=?,ser=?,grade=?,updated_at=datetime('now') WHERE id=?").run(values.saber,values.hacer,values.ser,values.grade,e.id);
          audit(user.id,values.grade===null?'Borrador de notas guardado':'Nota registrada',`Inscripción ${e.id}: ${e.grade??'pendiente'} → ${values.grade??'pendiente'}. Saber ${values.saber??'—'}, Hacer ${values.hacer??'—'}, Ser ${values.ser??'—'}`);
        }});return send({ok:true});
      }
      if(user.role!=='admin') fail('Acceso restringido.',403);
      if(req.method!=='POST') fail('Ruta no encontrada.',404);
      const b=body;
      if(path==='/api/users') {
        if(!['student','teacher'].includes(b.role)) fail('Rol inválido.');
        const ci=required(b.ci,'CI'); const name=required(b.name,'Nombre');
        if(ci.length<5) fail('El CI debe tener al menos 5 caracteres.');
        transaction(()=>{const r=db.prepare('INSERT INTO users(ci,name,role,password) VALUES (?,?,?,?)').run(ci,name,b.role,hashPassword(ci));
          if(b.role==='student') db.prepare('INSERT INTO students VALUES (?,?,?,?,?)').run(r.lastInsertRowid,number(b.career_id),number(b.shift_id),number(b.admission_year_id),level(b.level));
          audit(user.id,'Usuario creado',`${name} · ${b.role==='student'?'Estudiante':'Docente'}`);
        });return send({ok:true});
      }
      if(path==='/api/catalog') {
        const name=required(b.name,'Nombre');
        const tables={career:'careers',shift:'shifts',year:'years'};
        if(!tables[b.type]) fail('Catálogo inválido.');
        if(b.type==='year' && !/^20\d{2}$/.test(name)) fail('La gestión debe ser un año entre 2000 y 2099.');
        transaction(()=>{db.prepare(`INSERT INTO ${tables[b.type]}(name) VALUES (?)`).run(name);audit(user.id,'Catálogo actualizado',name);});return send({ok:true});
      }
      if(path==='/api/subjects') {
        transaction(()=>{db.prepare('INSERT INTO subjects(name,career_id,level) VALUES (?,?,?)').run(required(b.name,'Materia'),number(b.career_id),level(b.level));audit(user.id,'Materia creada',b.name);});return send({ok:true});
      }
      if(path==='/api/modules') {
        const start=date(b.start_date),end=date(b.end_date);if(start>end) fail('El fin debe ser posterior al inicio.');
        const yearId=number(b.year_id);
        if(db.prepare('SELECT count(*) n FROM modules WHERE year_id=?').get(yearId).n>=4) fail('Cada gestión admite hasta cuatro módulos.');
        if(db.prepare('SELECT id FROM modules WHERE year_id=? AND start_date<=? AND end_date>=?').get(yearId,end,start)) fail('El módulo se superpone con otro de la misma gestión.');
        const year=db.prepare('SELECT name FROM years WHERE id=?').get(yearId);if(!year||start.slice(0,4)!==year.name||end.slice(0,4)!==year.name) fail('Las fechas deben pertenecer a la gestión.');
        transaction(()=>{db.prepare('INSERT INTO modules(name,year_id,start_date,end_date) VALUES (?,?,?,?)').run(required(b.name,'Módulo'),yearId,start,end);audit(user.id,'Módulo creado',b.name);});return send({ok:true});
      }
      if(path==='/api/offerings') {
        const teacher=number(b.teacher_id);if(!db.prepare("SELECT id FROM users WHERE id=? AND role='teacher'").get(teacher)) fail('Docente inválido.');
        const subjectId=number(b.subject_id),careerId=number(b.career_id);
        const subject=db.prepare('SELECT career_id FROM subjects WHERE id=?').get(subjectId);
        if(!subject||subject.career_id!==careerId) fail('La materia debe pertenecer a la carrera seleccionada.');
        transaction(()=>{db.prepare('INSERT INTO offerings(subject_id,module_id,shift_id,teacher_id) VALUES (?,?,?,?)').run(subjectId,number(b.module_id),number(b.shift_id),teacher);audit(user.id,'Asignación docente creada',`Docente ${teacher} · carrera ${careerId} · materia ${subjectId}`);});return send({ok:true});
      }
      if(path==='/api/enrollments') {
        const s=db.prepare('SELECT * FROM students WHERE user_id=?').get(number(b.student_id));
        const o=db.prepare('SELECT o.*,s.career_id,s.level FROM offerings o JOIN subjects s ON s.id=o.subject_id WHERE o.id=?').get(number(b.offering_id));
        if(!s||!o) fail('Estudiante o materia inválidos.');
        if(s.career_id!==o.career_id||s.shift_id!==o.shift_id||s.level!==o.level) fail('La materia debe coincidir con la carrera, turno y año actual del estudiante.');
        transaction(()=>{db.prepare('INSERT INTO enrollments(student_id,offering_id) VALUES (?,?)').run(s.user_id,o.id);audit(user.id,'Inscripción realizada',`Estudiante ${s.user_id} · asignación ${o.id}`);});return send({ok:true});
      }
      if(path==='/api/student-status') {
        const s=db.prepare('SELECT * FROM students WHERE user_id=?').get(number(b.student_id));if(!s) fail('Estudiante no encontrado.');
        if(typeof b.blocked!=='boolean') fail('Estado inválido.');
        transaction(()=>{db.prepare('UPDATE users SET blocked=? WHERE id=?').run(b.blocked?1:0,s.user_id);audit(user.id,b.blocked?'Consulta suspendida':'Consulta habilitada',`Estudiante ${s.user_id} · gestión manual de pagos`);});return send({ok:true});
      }
      if(path==='/api/transfer') {
        const s=db.prepare('SELECT * FROM students WHERE user_id=?').get(number(b.student_id));if(!s) fail('Estudiante no encontrado.');
        const shift=number(b.shift_id),nextLevel=level(b.level),reason=required(b.reason,'Motivo');
        transaction(()=>{db.prepare('UPDATE students SET shift_id=?,level=? WHERE user_id=?').run(shift,nextLevel,s.user_id);audit(user.id,'Traslado / actualización académica',`Estudiante ${s.user_id}: turno ${s.shift_id} → ${shift}, año ${s.level} → ${nextLevel}. ${reason}. Historial conservado.`);});return send({ok:true});
      }
      if(path==='/api/unlock') {
        const id=number(b.offering_id),reason=required(b.reason,'Motivo');
        const o=db.prepare('SELECT id FROM offerings WHERE id=?').get(id);if(!o) fail('Materia no encontrada.');
        const hours=number(b.hours);if(hours>168) fail('La reapertura admite un máximo de 168 horas.');
        const until=new Date(Date.now()+hours*3600000).toISOString();
        transaction(()=>{db.prepare('UPDATE offerings SET unlocked_until=? WHERE id=?').run(until,id);audit(user.id,'Plazo reabierto',`Asignación ${id} hasta ${until}. ${reason}`);});return send({ok:true});
      }
      fail('Ruta no encontrada.',404);
    } catch(e) {
      if(e.code?.startsWith('SQLITE_CONSTRAINT') || /constraint failed/i.test(e.message)) return send({error:/UNIQUE/i.test(e.message)?'Este registro ya existe. Revisa los datos.':'La operación no es válida. Revisa las relaciones y los datos seleccionados.'},409);
      if(!e.status) console.error(e);
      send({error:e.status?e.message:'Ocurrió un error interno.'},e.status||500);
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const server=createApp();const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>console.log(`Ceicom iniciado en el puerto ${port}. Base SQLite local. Datos iniciales de demostración.`));
}
