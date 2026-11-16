// 儲存層的兩種可辨識錯誤（獨立一個檔案，免得 store.js 和各個 driver 互相 import）。

/** 條件寫入失敗：要建立的檔案已經存在，或是 ETag 已經被別人改掉 */
export class ConflictError extends Error {
  constructor(path) {
    super(`write conflict: ${path}`);
    this.name = 'ConflictError';
    this.code = 'conflict';
    this.path = path;
  }
}

/** 沒有可用的儲存空間（沒接上、權杖失效、store 被停用）→ 對外是 503 no_store */
export class StoreUnavailableError extends Error {
  constructor(message = 'no storage configured', options) {
    super(message, options);
    this.name = 'StoreUnavailableError';
    this.code = 'no_store';
  }
}
