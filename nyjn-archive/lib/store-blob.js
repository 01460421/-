// Vercel Blob driver（私有 store）。
// 以下行為是對照 @vercel/blob 2.9.0 的型別定義與程式碼確認過的：
//   get(pathname, { access: 'private', useCache: false })
//     → 找不到回 null；找到回 { statusCode: 200, stream, blob: { etag, … } }
//     → useCache: false 會加上 ?cache=0，直接讀來源，不經 CDN 快取
//   put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite, ifMatch })
//     → allowOverwrite 預設 false，檔案已存在就會失敗（沒有專屬的錯誤類別）
//     → ifMatch 不符時丟 BlobPreconditionFailedError
//   del(pathnames[])、list({ prefix, limit, cursor }) → { blobs, cursor, hasMore }
import * as blobSdk from '@vercel/blob';
import { ConflictError, StoreUnavailableError } from './store-errors.js';

const REQUEST_TIMEOUT_MS = 8_000; // vercel.json 給函式 15 秒，單一次 Blob 操作不該吃掉全部
const LIST_PAGE = 1000;
const LIST_MAX_PAGES = 10;
const DELETE_BATCH = 100;

// 用自己的 AbortController 計時：abort() 預設丟出 AbortError，SDK 看到會立刻放棄；
// AbortSignal.timeout() 丟的是 TimeoutError，SDK 會把它當成一般錯誤一再重試。
async function withTimeout(task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

const className = (error) => error?.constructor?.name || '';
const messageOf = (error) => String(error?.message || '');

function isPreconditionFailed(sdk, error) {
  return (
    (sdk.BlobPreconditionFailedError && error instanceof sdk.BlobPreconditionFailedError) ||
    className(error) === 'BlobPreconditionFailedError' ||
    /precondition failed/i.test(messageOf(error))
  );
}

const UNAVAILABLE_CLASSES = new Set(['BlobStoreNotFoundError', 'BlobStoreSuspendedError', 'BlobAccessError']);

function isUnavailable(error) {
  return (
    UNAVAILABLE_CLASSES.has(className(error)) ||
    /No blob credentials found|No read-write token found|unable to extract store ID/i.test(messageOf(error))
  );
}

/** store 不存在、被停用、權杖失效 → 503 no_store；其他錯誤原樣往外丟（變成 500） */
function translate(error) {
  return isUnavailable(error) ? new StoreUnavailableError('blob store unavailable', { cause: error }) : error;
}

/** @param {typeof blobSdk} sdk 測試時可以換成假的 */
export function createBlobDriver(sdk = blobSdk) {
  async function get(path) {
    try {
      return await withTimeout(async (abortSignal) => {
        const found = await sdk.get(path, { access: 'private', useCache: false, abortSignal });
        if (!found || found.statusCode !== 200 || !found.stream) return { body: null, etag: null };
        const body = await new Response(found.stream).text();
        let etag = found.blob?.etag || null;
        // 理論上一定有 ETag；真的沒有就多問一次 head()，否則之後的條件寫入永遠不會成功
        if (!etag) etag = (await sdk.head(path, { abortSignal })).etag || null;
        return { body, etag };
      });
    } catch (error) {
      throw translate(error);
    }
  }

  async function put(path, body, { etag } = {}) {
    const options = {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
    };
    if (etag) {
      // 更新：只有 ETag 還是我們讀到的那個才寫
      options.allowOverwrite = true;
      options.ifMatch = etag;
    } else {
      // 建立：已經存在就要失敗
      options.allowOverwrite = false;
    }

    try {
      const result = await withTimeout((abortSignal) => sdk.put(path, body, { ...options, abortSignal }));
      return { etag: result?.etag || null };
    } catch (error) {
      if (isPreconditionFailed(sdk, error)) throw new ConflictError(path);
      if (isUnavailable(error)) throw translate(error);
      if (!etag) {
        // 「已經存在」在這一版 SDK 沒有專屬的錯誤類別，訊息文字也可能改；
        // 所以建立失敗時實際確認一次：檔案在，就是被別人搶先建立了。
        if (/already exists/i.test(messageOf(error))) throw new ConflictError(path);
        const probe = await get(path).catch(() => null);
        if (probe?.etag) throw new ConflictError(path);
      }
      throw error;
    }
  }

  async function del(paths) {
    try {
      for (let i = 0; i < paths.length; i += DELETE_BATCH) {
        const batch = paths.slice(i, i + DELETE_BATCH);
        await withTimeout((abortSignal) => sdk.del(batch, { abortSignal }));
      }
    } catch (error) {
      throw translate(error);
    }
  }

  async function list(prefix = '') {
    const out = [];
    let cursor;
    try {
      for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
        const result = await withTimeout((abortSignal) =>
          sdk.list({ prefix: prefix || undefined, limit: LIST_PAGE, cursor, abortSignal }),
        );
        for (const blob of result.blobs || []) {
          out.push({
            path: blob.pathname,
            uploadedAt: new Date(blob.uploadedAt).getTime(),
            size: blob.size,
          });
        }
        if (!result.hasMore || !result.cursor) break;
        cursor = result.cursor;
        if (page === LIST_MAX_PAGES - 1) {
          console.warn(`[nyjn] list("${prefix}") 超過 ${LIST_PAGE * LIST_MAX_PAGES} 筆，只處理了前面的部分`);
        }
      }
    } catch (error) {
      throw translate(error);
    }
    return out;
  }

  return { kind: 'blob', retryBaseMs: 40, get, put, del, list };
}
