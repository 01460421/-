// 回報一筆內容；滿 REPORT_HIDE 個人就自動隱藏。邏輯在 lib/reactions.js。
import { serve } from '../lib/http.js';
import { report } from '../lib/reactions.js';

export default async function handler(req, res) {
  return serve(req, res, { POST: report });
}
