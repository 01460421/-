// 後端在不在、用的是哪一種儲存。不碰儲存空間。邏輯在 lib/health.js。
import { health } from '../lib/health.js';
import { serve } from '../lib/http.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: health });
}
