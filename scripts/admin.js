import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openDatabase} from '../db.js';
import {hashPassword} from '../lib.js';
export async function createAdmin(db,{ci,name,password}) {
  if(!ci?.trim()||!name?.trim()||ci.length>160||name.length>160)throw new Error('Usuario y nombre son obligatorios (máximo 160 caracteres).');
  if(typeof password!=='string'||password.length<8||password.length>160||password===ci)throw new Error('Usa una contraseña inicial de 8 a 160 caracteres, diferente del usuario.');
  await db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202602)');
    if(await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get())throw new Error('Ya existe un administrador. Este comando no lo reemplaza.');
    const user=await db.prepare("INSERT INTO users(ci,name,role,password) VALUES (?,?,'admin',?)").run(ci.trim(),name.trim(),hashPassword(password));
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(user.lastInsertRowid,'Administrador inicial creado','Creación local segura; cambio de contraseña requerido al ingresar.');
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let muted=false;
  const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
  const rl=createInterface({input:process.stdin,output,terminal:Boolean(process.stdin.isTTY)});
  let db;
  try {
    const ci=await rl.question('Usuario del administrador: '),name=await rl.question('Nombre completo: ');
    const first=rl.question('Contraseña inicial (no se mostrará): ');muted=true;const password=await first;muted=false;console.log();
    const second=rl.question('Confirmar contraseña: ');muted=true;const confirm=await second;muted=false;console.log();
    if(password!==confirm)throw new Error('Las contraseñas no coinciden.');
    db=await openDatabase();await createAdmin(db,{ci,name,password});console.log('Administrador creado. Cambia la contraseña inicial al ingresar al portal.');
  }catch(error){console.error(error.code==='23505'?'El usuario ya existe.':error.message);process.exitCode=1;}
  finally{muted=false;rl.close();if(db)await db.close();}
}
