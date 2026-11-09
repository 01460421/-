/** 執行 db/schema.sql：npm run db:migrate（需設定 DATABASE_URL） */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('請先設定 DATABASE_URL');
  process.exit(1);
}
const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require' });
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
await sql.unsafe(schema);
console.log('schema 已套用');
await sql.end();
