// 每天一次的打掃（vercel.json 的 crons 會來叫它）。邏輯在 lib/sweep.js。
import { serve } from '../../lib/http.js';
import { sweep } from '../../lib/sweep.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: sweep });
}
