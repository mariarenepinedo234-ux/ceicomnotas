import {openDatabase} from '../db.js';
const db=await openDatabase();
try {console.log('Migraciones PostgreSQL aplicadas.');}finally{await db.close();}
