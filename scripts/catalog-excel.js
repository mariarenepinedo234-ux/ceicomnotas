import {readFile} from 'node:fs/promises';
import {openDatabase} from '../db.js';
import {parseCatalog,applyCatalog} from '../catalog.js';
let db;
try{
  const filename=process.argv.slice(2).find(v=>!v.startsWith('--'));
  if(!filename)throw new Error('Uso: npm run catalogo:importar -- archivo.xlsx [--aplicar]');
  const payload=await parseCatalog(await readFile(filename));
  console.log('Resumen:',{careers:payload.careers.length,subjects:payload.subjects.length,teachers:payload.teachers.length,careers_pending:payload.missing.length,warnings:payload.warnings.length});
  if(process.argv.includes('--aplicar')){db=await openDatabase();console.log('Aplicación terminada:',await applyCatalog(db,payload));}
  else console.log('Solo revisión. Añade --aplicar para guardar. El archivo original no se modifica.');
}catch(error){console.error(error.code?'No se pudo aplicar el catálogo. Se revirtió la importación.':error.message);process.exitCode=1;}
finally{if(db)await db.close();}
