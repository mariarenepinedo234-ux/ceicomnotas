import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openDatabase} from '../db.js';
import {hashPassword,verifyPassword} from '../lib.js';

class RecoveryError extends Error {}
function validate({ci,password,confirmation}){
  if(typeof ci!=='string'||!ci.trim()||ci.length>160)throw new RecoveryError('Indica el usuario del administrador (máximo 160 caracteres).');
  if(typeof password!=='string'||password!==password.trim()||password.length<8||password.length>160)throw new RecoveryError('Usa una contraseña temporal de 8 a 160 caracteres, sin espacios al principio ni al final.');
  if(password===ci.trim())throw new RecoveryError('La contraseña temporal debe ser distinta del usuario.');
  if(password!==confirmation)throw new RecoveryError('Las contraseñas no coinciden. No se cambió la cuenta.');
}

// Herramienta local: requiere acceso a DATABASE_URL y no tiene ruta HTTP.
export async function recoverAdmin(db,input){
  validate(input);
  return db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202602)');
    const user=await db.prepare("SELECT id,ci,password FROM users WHERE ci=? AND role='admin' FOR UPDATE").get(input.ci.trim());
    if(!user)throw new RecoveryError('No se encontró un administrador con ese usuario. Revisa el usuario y la base configurada en .env.');
    if(verifyPassword(input.password,user.password))throw new RecoveryError('Elige una contraseña temporal distinta de la anterior.');
    await db.prepare('UPDATE users SET password=?,must_change=1 WHERE id=?').run(hashPassword(input.password),user.id);
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (?,?,?)').run(user.id,'Acceso de administrador recuperado','Recuperación local desde terminal. Sesiones anteriores anuladas; cambio de contraseña obligatorio al ingresar.');
    return {ok:true};
  });
}

const help=`Recuperar una cuenta de administrador existente\n\nUso: npm run recuperar-admin\n\nDesde la carpeta del proyecto, con PostgreSQL disponible y DATABASE_URL en .env.\nPide el usuario y dos veces la contraseña temporal, sin mostrar la clave.\nAl ingresar al portal debes cambiarla. Conserva los datos académicos.\nNo admite contraseñas por argumentos, archivos, variables ni entrada redirigida.\nCancela con Ctrl + C antes de completar las preguntas.\n`;

export async function runRecoveryCommand({args=[],input=process.stdin,output=process.stdout,errorOutput=process.stderr,connect=()=>openDatabase({migrate:false})}={}){
  if(args.length===1&&['--help','-h'].includes(args[0])){output.write(help);return 0;}
  if(args.length){errorOutput.write('Este comando no admite argumentos. Usa npm run recuperar-admin y responde en la terminal.\n');return 1;}
  if(!input.isTTY||!output.isTTY){errorOutput.write('Abre una terminal interactiva y ejecuta npm run recuperar-admin. No se acepta entrada redirigida ni contraseñas por tuberías.\n');return 1;}
  let muted=false,db,rl;
  const controller=new AbortController();
  const screen=new Writable({write(chunk,encoding,callback){if(!muted)output.write(chunk);callback();}});
  try{
    output.write('Recuperación local del administrador. Se anularán sus sesiones anteriores.\n');
    rl=createInterface({input,output:screen,terminal:true,historySize:0});
    rl.on('SIGINT',()=>controller.abort());rl.on('close',()=>controller.abort());
    const ask=async(label,secret=false)=>{
      const answer=rl.question(label,{signal:controller.signal});muted=secret;
      try{return await answer;}finally{muted=false;if(secret)output.write('\n');}
    };
    const ci=await ask('Usuario del administrador: ');
    const password=await ask('Contraseña temporal (no se mostrará): ',true);
    const confirmation=await ask('Confirmar contraseña temporal: ',true);
    rl.close();validate({ci,password,confirmation});
    db=await connect();await recoverAdmin(db,{ci,password,confirmation});
    output.write('Acceso recuperado. Ingresa con tu usuario y la contraseña temporal. El portal te pedirá una contraseña personal nueva.\n');
    return 0;
  }catch(error){
    if(error.name==='AbortError'||error.code==='ERR_USE_AFTER_CLOSE'){errorOutput.write('Recuperación cancelada. No se cambió la cuenta.\n');return 130;}
    errorOutput.write((error instanceof RecoveryError?error.message:'No se completó la recuperación. Comprueba PostgreSQL y DATABASE_URL en .env; usa la versión actualizada del sistema.')+'\n');
    return 1;
  }finally{
    muted=false;rl?.close();
    if(db)try{await db.close();}catch{errorOutput.write('No se pudo cerrar la conexión con PostgreSQL.\n');}
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  process.exitCode=await runRecoveryCommand({args:process.argv.slice(2)});
}
