// 接龍、展牆與公開推測：讀頻道、貼一筆、刪一筆。邏輯在 lib/board.js。
import { deleteBoard, listBoard, postBoard } from '../lib/board.js';
import { serve } from '../lib/http.js';

export default async function handler(req, res) {
  return serve(req, res, { GET: listBoard, POST: postBoard, DELETE: deleteBoard });
}
