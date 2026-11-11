// 館主的審核工具。沒設定 ADMIN_KEY 時整組回 404。邏輯在 lib/admin.js。
import { adminGet, adminGuard, adminPost } from '../lib/admin.js';
import { serve } from '../lib/http.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: adminGet, POST: adminPost }, { guard: adminGuard });
}
