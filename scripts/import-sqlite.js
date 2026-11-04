import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openDatabase,applicationTables,resetSequences,requireEmptyDatabase} from '../db.js';

export async function importSqlite(db,filename){
  const source=new DatabaseSync(resolve(filename),{readOnly:true});
  const tables=applicationTables.filter(t=>!['sessions','teacher_directory','catalog_import_batches','academic_groups','academic_group_students','study_plans'].includes(t));
  try {
    source.exec('PRAGMA query_only=ON; BEGIN');
    if(source.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite contiene relaciones inválidas. Corrígelas antes de importar.');
    const snapshot={};
    for(const table of tables){
      if(!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw new Error(`Falta la tabla ${table} en SQLite.`);
      snapshot[table]=source.prepare(`SELECT * FROM ${table} ORDER BY ${table==='students'?'user_id':'id'}`).all();
    }
    return await db.transaction(async()=>{
      await db.exec(`LOCK TABLE ${applicationTables.join(',')} IN ACCESS EXCLUSIVE MODE`);
      await requireEmptyDatabase(db);
      const counts={};
      for(const table of tables){
        const allowed=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',[table])).rows.map(r=>r.column_name);
        for(const row of snapshot[table]){
          const keys=allowed.filter(key=>Object.hasOwn(row,key));
          const values=keys.map(key=>{
            const value=row[key];
            if(value!==null&&['created_at','updated_at','unlocked_until'].includes(key)){
              const iso=String(value).replace(' ','T');
              return /(?:Z|[+-]\d\d:\d\d)$/.test(iso)?iso:iso+'Z';
            }
            return value;
          });
          await db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,values);
        }
        counts[table]=(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n;
        if(counts[table]!==snapshot[table].length)throw new Error(`No coincide el número de registros en ${table}.`);
        // Confirmar también los valores académicos y de autenticación, no solo el conteo.
        const key=table==='students'?'user_id':'id';
        const restored=await db.prepare(`SELECT * FROM ${table} ORDER BY ${key}`).all();
        for(let i=0;i<restored.length;i++)for(const column of allowed){
          if(!Object.hasOwn(snapshot[table][i],column))continue;
          const before=snapshot[table][i][column],after=restored[i][column];
          const timestamp=['created_at','updated_at','unlocked_until'].includes(column);
          if(timestamp&&before!==null){
            const iso=String(before).replace(' ','T');const normalized=/(?:Z|[+-]\d\d:\d\d)$/.test(iso)?iso:iso+'Z';
            if(new Date(normalized).getTime()!==new Date(after).getTime())throw new Error(`No coincide una fecha en ${table}.`);
          }else if(before!==after)throw new Error(`No coincide un valor en ${table}.${column}.`);
        }
      }
      await resetSequences(db);
      await db.prepare('INSERT INTO audit(actor_id,action,detail) VALUES (NULL,?,?)').run('Migración SQLite → PostgreSQL','Importación íntegra verificada; sesiones anteriores excluidas. Archivo SQLite conservado sin cambios.');
      return counts;
    });
  }finally{source.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let db;
  try{
    const filename=process.argv[2];if(!filename)throw new Error('Uso: npm run db:importar -- ruta/al/archivo.sqlite');
    db=await openDatabase();const counts=await importSqlite(db,filename);
    console.log('Importación terminada y verificada. Registros por tabla:',counts);
    console.log('SQLite permanece intacto. Todos los usuarios deben iniciar sesión de nuevo.');
  }catch(error){console.error(error.code?'La importación falló por un dato o conexión inválidos. No se importó ningún registro. Revisa la estructura y relaciones del origen.':error.message);process.exitCode=1;}
  finally{if(db)await db.close();}
}
