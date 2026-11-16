// 大廳用的全館摘要。邏輯在 lib/pulse.js。
import { serve } from '../lib/http.js';
import { pulse } from '../lib/pulse.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: pulse });
}
