import {randomBytes} from 'node:crypto';
import {openDatabase} from '../db.js';
import {seedDemo} from '../seed.js';
export async function testDatabase({demo=true}={}){
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString)throw new Error('Falta TEST_DATABASE_URL. Las pruebas requieren PostgreSQL real y crean esquemas temporales aislados; configura una conexión de desarrollo en .env.');
  const schema='ceicom_test_'+randomBytes(10).toString('hex');
  const db=await openDatabase({connectionString,schema,createSchema:true});
  try {if(demo)await seedDemo(db);}catch(error){await db.close();throw error;}
  const close=db.close.bind(db);
  db.cleanup=async()=>{await db.exec(`DROP SCHEMA "${schema}" CASCADE`);await close();};
  return db;
}
