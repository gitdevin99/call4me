import pg from 'pg';
import {readFileSync} from 'node:fs';
let pool;
export const dbConfigured = () => Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_PASSWORD);
export function db() {
 if (!pool) {
  if (!dbConfigured()) throw new Error('Account storage is not configured.');
  pool = new pg.Pool(process.env.DATABASE_URL ? {connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('./supabase-ca.crt',import.meta.url),'utf8')},max:5,connectionTimeoutMillis:10000} : {
   host:new URL(process.env.VITE_SUPABASE_URL).hostname.replace('.supabase.co','').replace(/^/,'db.')+'.supabase.co',
   user:'postgres',database:'postgres',port:5432,password:process.env.SUPABASE_DB_PASSWORD,
   ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('./supabase-ca.crt',import.meta.url),'utf8')},max:5,connectionTimeoutMillis:10000
  });
  pool.on('error',()=>console.error('Database connection interrupted'));
 }
 return pool;
}
export async function transaction(fn) {
 const c=await db().connect();
 try {await c.query('begin'); const result=await fn(c);await c.query('commit');return result;}
 catch(e){await c.query('rollback');throw e;} finally {c.release();}
}
export async function walletLock(c,user) {
 await c.query('insert into callapp.wallets(user_id) values($1) on conflict do nothing',[user]);
 return (await c.query('select * from callapp.wallets where user_id=$1 for update',[user])).rows[0];
}
