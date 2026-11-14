// 八個時刻與十一場雨的投票。邏輯在 lib/poll.js。
import { serve } from '../lib/http.js';
import { vote } from '../lib/poll.js';

export default async function handler(req, res) {
  return serve(req, res, { POST: vote });
}
