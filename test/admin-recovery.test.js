import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Writable} from 'node:stream';
import {testDatabase} from './helpers.js';
import {createApp} from '../server.js';
import {recoverAdmin,runRecoveryCommand} from '../scripts/recover-admin.js';
import {applicationTables} from '../db.js';
import {verifyPassword} from '../lib.js';
const temporary='TemporalDePrueba2026!',personal='PersonalDePrueba2026!';
const recovery=(password=temporary,ci='admin')=>({ci,password,confirmation:password});
async function setup(t){
  const db=await testDatabase();await db.exec('UPDATE users SET must_change=0');
  const server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(r=>server.close(r));await db.cleanup();});
  async function api(path,body,cookie){const response=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  return {db,api};
}
async function records(db){const state={};for(const table of applicationTables){if(['audit','sessions'].includes(table))continue;state[table]=(await db.query(`SELECT * FROM ${table} ORDER BY to_jsonb(${table})::text`)).rows;}return state;}
function terminal(answers){
 const input=new PassThrough();input.isTTY=true;let text='',error='',next=0;
 const output=new Writable({write(chunk,encoding,done){text+=chunk.toString();if(/(?:Usuario del administrador|Contraseña temporal \(no se mostrará\)|Confirmar contraseña temporal): $/.test(chunk.toString())){const value=answers[next++];setImmediate(()=>value===null?input.end():input.write(value+'\r'));}done();}});output.isTTY=true;
 const errorOutput=new Writable({write(chunk,encoding,done){error+=chunk.toString();done();}});
 return {input,output,errorOutput,result:()=>({text,error})};
}

test('recuperación local conserva registros, revoca solo sus sesiones y exige cambiar la clave temporal',async t=>{
 const {db,api}=await setup(t),old=await api('login',{ci:'admin',password:'Ceicom2026!'}),old2=await api('login',{ci:'admin',password:'Ceicom2026!'}),teacher=await api('login',{ci:'4567890',password:'4567890'}),student=await api('login',{ci:'7000001',password:'7000001'});
 const before=await records(db),oldHash=before.users.find(u=>u.id===1).password;
 assert.deepEqual(await recoverAdmin(db,recovery()),{ok:true});const after=await records(db),admin=after.users.find(u=>u.id===1);
 assert.ok(verifyPassword(temporary,admin.password));assert.equal(verifyPassword('Ceicom2026!',admin.password),false);assert.notEqual(admin.password,oldHash);assert.equal(admin.must_change,1);
 after.users=after.users.map(u=>u.id===1?{...u,password:oldHash,must_change:0}:u);assert.deepEqual(after,before);
 assert.equal((await api('me',null,old.cookie)).status,401);assert.equal((await api('me',null,old2.cookie)).status,401);assert.equal((await api('me',null,teacher.cookie)).status,200);assert.equal((await api('me',null,student.cookie)).status,200);
 assert.equal((await api('login',{ci:'admin',password:'Ceicom2026!'})).status,401);
 const login=await api('login',{ci:'admin',password:temporary});assert.equal(login.status,200);assert.equal(login.body.must_change,true);assert.equal((await api('data',null,login.cookie)).status,403);
 assert.equal((await api('password',{current:temporary,password:personal},login.cookie)).status,200);assert.equal((await api('data',null,login.cookie)).status,200);
 const audit=await db.prepare("SELECT * FROM audit WHERE action='Acceso de administrador recuperado'").all();assert.equal(audit.length,1);assert.equal(audit[0].actor_id,1);for(const secret of [temporary,oldHash])assert.ok(!JSON.stringify(audit).includes(secret));
 // La recuperación sigue siendo exclusivamente local.
 assert.equal((await api('recuperar-admin',recovery(),teacher.cookie)).status,403);assert.equal((await api('recuperar-admin',recovery(),login.cookie)).status,404);
});

test('errores de usuario, rol, contraseña y confirmación no cambian cuentas, sesiones ni auditoría',async t=>{
 const {db,api}=await setup(t);await api('login',{ci:'admin',password:'Ceicom2026!'});const before=await records(db),sessions=await db.prepare('SELECT * FROM sessions ORDER BY token').all(),audits=await db.prepare('SELECT * FROM audit ORDER BY id').all();
 for(const input of [recovery('Ceicom2026!'),recovery(temporary,'4567890'),recovery(temporary,'7000001'),recovery(temporary,'no-existe'),recovery(temporary,''),recovery(temporary,'x'.repeat(161)),recovery('corta'),recovery('x'.repeat(161)),recovery(' espacios2026 '),recovery('admin'),{...recovery(),confirmation:'NoCoincide2026!'},recovery(null),{password:temporary,confirmation:temporary}])await assert.rejects(recoverAdmin(db,input));
 assert.deepEqual(await records(db),before);assert.deepEqual(await db.prepare('SELECT * FROM sessions ORDER BY token').all(),sessions);assert.deepEqual(await db.prepare('SELECT * FROM audit ORDER BY id').all(),audits);
});

test('si falla la auditoría se revierten contraseña, obligación de cambio y revocación de sesiones',async t=>{
 const {db,api}=await setup(t);const login=await api('login',{ci:'admin',password:'Ceicom2026!'}),user=await db.prepare('SELECT * FROM users WHERE id=1').get(),sessions=await db.prepare('SELECT * FROM sessions ORDER BY token').all();
 await db.exec("CREATE FUNCTION reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de auditoría de prueba'; END $$; CREATE TRIGGER reject_recovery BEFORE INSERT ON audit FOR EACH ROW EXECUTE FUNCTION reject_recovery_audit()");
 await assert.rejects(recoverAdmin(db,recovery()),/Fallo de auditoría/);assert.deepEqual(await db.prepare('SELECT * FROM users WHERE id=1').get(),user);assert.deepEqual(await db.prepare('SELECT * FROM sessions ORDER BY token').all(),sessions);assert.equal((await api('me',null,login.cookie)).status,200);
});

test('un acceso ya iniciado con la contraseña anterior no crea una sesión posterior a la recuperación',{timeout:10000},async t=>{
 const {db,api}=await setup(t),read=Promise.withResolvers(),resume=Promise.withResolvers(),recoveringRead=Promise.withResolvers(),prepare=db.prepare.bind(db);let hold=true;
 t.signal.addEventListener('abort',()=>resume.resolve(),{once:true});
 db.prepare=sql=>{
  const statement=prepare(sql);
  if(sql==='SELECT * FROM users WHERE ci=? FOR SHARE')return {...statement,get:async(...values)=>{const row=await statement.get(...values);if(hold){hold=false;read.resolve();await resume.promise;}return row;}};
  if(sql.includes("role='admin' FOR UPDATE"))return {...statement,get:(...values)=>{const result=statement.get(...values);recoveringRead.resolve();return result;}};
  return statement;
 };
 try{
  const login=api('login',{ci:'admin',password:'Ceicom2026!'});await read.promise;
  const recoveryResult=recoverAdmin(db,recovery());await recoveringRead.promise;resume.resolve();
  const [response]=await Promise.all([login,recoveryResult]);assert.equal(response.status,200);
  assert.equal((await api('me',null,response.cookie)).status,401);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=1').get()).n,0);
  assert.equal((await api('login',{ci:'admin',password:'Ceicom2026!'})).status,401);assert.equal((await api('login',{ci:'admin',password:temporary})).status,200);
 }finally{resume.resolve();db.prepare=prepare;}
});

test('el comando oculta ambas claves, no conserva historial y cierra la conexión al terminar',async()=>{
 const tty=terminal(['admin',temporary,temporary]);let calls=0,closed=false;const actions=[];
 const db={transaction:async fn=>fn(),query:async()=>{},prepare:sql=>({get:async()=>({id:1,ci:'admin',password:null}),run:async(...args)=>{actions.push([sql,...args]);}}),close:async()=>{closed=true;}};
 const status=await runRecoveryCommand({...tty,connect:async()=>{calls++;return db;}});assert.equal(status,0);assert.equal(calls,1);assert.equal(closed,true);assert.match(tty.result().text,/Acceso recuperado/);assert.ok(!tty.result().text.includes(temporary));assert.equal(tty.result().error,'');assert.equal(actions.length,3);
});

test('cancelación, fin de entrada y confirmación incorrecta no abren PostgreSQL ni imprimen la clave',async()=>{
 for(const answers of [['admin','\x03'],['admin',null],['admin',temporary,'OtraClave2026!']]){
  const tty=terminal(answers);let opened=false;const code=await runRecoveryCommand({...tty,connect:async()=>{opened=true;throw new Error('No debe conectarse');}});assert.equal(opened,false);assert.ok([1,130].includes(code));assert.ok(!tty.result().text.includes(temporary));assert.ok(!tty.result().error.includes(temporary));
 }
});

test('ayuda, argumentos rechazados, entrada redirigida y fallos de conexión no filtran información privada',async()=>{
 const out=()=>{let text='';return {stream:new Writable({write(chunk,encoding,done){text+=chunk.toString();done();}}),read:()=>text};};
 for(const args of [['--help'],['-h'],['--password',temporary],[]]){
  const output=out(),errors=out();let calls=0;const status=await runRecoveryCommand({args,input:new PassThrough(),output:output.stream,errorOutput:errors.stream,connect:async()=>{calls++;}});assert.equal(status,args.includes('--help')||args.includes('-h')?0:1);assert.equal(calls,0);assert.ok(!output.read().includes(temporary));assert.ok(!errors.read().includes(temporary));
 }
 const tty=terminal(['admin',temporary,temporary]);assert.equal(await runRecoveryCommand({...tty,connect:async()=>{throw new Error('postgresql://privado:contraseña@servidor/db');}}),1);assert.match(tty.result().error,/No se completó/);assert.ok(!tty.result().error.includes('postgresql://'));
});
