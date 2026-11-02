import {readFile} from 'node:fs/promises';
import {openDatabase} from '../db.js';
import {loadRosters} from '../rosters.js';
let db;
try{
  const file=process.argv.slice(2).find(a=>!a.startsWith('--'));if(!file)throw new Error('Uso: npm run grupos:importar -- archivo-privado.json [--aplicar]');
  const payload=JSON.parse(await readFile(file,'utf8'));
  console.log('Grupos:',payload.groups?.length,'Gestión de ingreso:',payload.admission_year,'Gestión cursada:',payload.academic_year);
  if(process.argv.includes('--aplicar')){db=await openDatabase();console.log('Carga verificada:',await loadRosters(db,payload));}
  else console.log('Solo revisión. Añade --aplicar para guardar; no se imprimen nombres ni CI.');
}catch(error){console.error(error.code?'Falló la carga. Se revirtió toda la operación.':error.message);process.exitCode=1;}
finally{if(db)await db.close();}
