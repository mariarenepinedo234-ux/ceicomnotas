import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const transactions=new AsyncLocalStorage();
const int8=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Entero PostgreSQL fuera del rango seguro.');return n;};
const types={getTypeParser:(oid,format)=>oid===20?int8:oid===1082?v=>v:pg.types.getTypeParser(oid,format)};
export function parameters(sql) {
  let index=0;
  return sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g,token=>token==='?'?`$${++index}`:token);
}
const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value]));
export async function openDatabase(options={}) {
  const connectionString=options.connectionString||process.env.DATABASE_URL;
  if(!connectionString)throw new Error('Falta DATABASE_URL. Ejecuta npm run configurar y sigue GUIA-PARA-PROBAR.md para iniciar PostgreSQL.');
  const schema=options.schema||'public';
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Esquema PostgreSQL inválido.');
  const pool=new pg.Pool({connectionString,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,application_name:'ceicom-academico',options:`-c search_path=${schema},public -c timezone=UTC`,types});
  pool.on('error',()=>console.error('Se interrumpió una conexión inactiva con PostgreSQL.'));
  const db={
    dialect:'postgres',
    async query(sql,values=[]) {
      const active=transactions.getStore();
      const result=await (active?.db===db?active.client:pool).query(sql,values);
      return Array.isArray(result)?result:{...result,rows:result.rows.map(normalize)};
    },
    prepare(sql) {
      const compiled=parameters(sql);
      return {
        async get(...values){return (await db.query(compiled,values)).rows[0];},
        async all(...values){return (await db.query(compiled,values)).rows;},
        async run(...values){
          const insertUser=/^\s*INSERT\s+INTO\s+users\b/i.test(compiled)&&!/\bRETURNING\b/i.test(compiled);
          const result=await db.query(insertUser?compiled+' RETURNING id':compiled,values);
          return {changes:result.rowCount,lastInsertRowid:result.rows?.[0]?.id};
        },
      };
    },
    async exec(sql){await db.query(sql);},
    async transaction(fn,{isolation='READ COMMITTED'}={}) {
      if(transactions.getStore()?.db===db)throw new Error('Transacción anidada no admitida.');
      if(!['READ COMMITTED','REPEATABLE READ','SERIALIZABLE'].includes(isolation))throw new Error('Aislamiento inválido.');
      const client=await pool.connect();
      try {
        await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
        const result=await transactions.run({db,client},fn);
        await client.query('COMMIT');return result;
      }catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
    },
    async close(){await pool.end();},
  };
  try {
    if(options.createSchema)await db.exec(`CREATE SCHEMA "${schema}"`);
    if(options.migrate!==false)await migrateDatabase(db);
    return db;
  }catch(error){await db.close();throw error;}
}
export async function migrateDatabase(db) {
  await db.transaction(async()=>{
    await db.query('SELECT pg_advisory_xact_lock(731202601)');
    await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const root=new URL('./migrations/',import.meta.url);
    for(const name of (await readdir(root)).filter(f=>/^\d+_[a-z_]+\.sql$/.test(f)).sort()){
      const sql=await readFile(new URL(name,root),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
      const previous=await db.prepare('SELECT checksum FROM schema_migrations WHERE name=?').get(name);
      if(previous){if(previous.checksum!==checksum)throw new Error(`La migración ${name} fue modificada después de aplicarse.`);continue;}
      await db.exec(sql);await db.prepare('INSERT INTO schema_migrations(name,checksum) VALUES (?,?)').run(name,checksum);
    }
  });
}
export const applicationTables=['users','careers','shifts','years','subjects','modules','students','offerings','enrollments','audit','sessions'];
export const identityTables=applicationTables.filter(t=>!['students','sessions'].includes(t));
export async function resetSequences(db){
  for(const table of identityTables)await db.query(`SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM ${table}),1),(SELECT COUNT(*)>0 FROM ${table}))`,[table]);
}
export async function requireEmptyDatabase(db){
  for(const table of applicationTables)if((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).n)throw new Error(`La base de destino no está vacía (${table}). No se modificó ningún registro.`);
}
