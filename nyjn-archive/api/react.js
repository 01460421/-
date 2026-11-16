// 共鳴（每位作者對每一筆一個，可以改、可以收回）。邏輯在 lib/reactions.js。
import { serve } from '../lib/http.js';
import { react } from '../lib/reactions.js';

export default async function handler(req, res) {
  return serve(req, res, { POST: react });
}
