// 雲端存檔（後端只看得到密文）。邏輯在 lib/case.js。
import { deleteCase, getCase, putCase } from '../lib/case.js';
import { serve } from '../lib/http.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: getCase, PUT: putCase, DELETE: deleteCase });
}
