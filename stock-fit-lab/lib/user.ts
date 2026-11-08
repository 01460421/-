/**
 * 使用者識別（尚未接登入系統時）：以 httpOnly cookie `sfl_uid` 的隨機 UUID 區分使用者，
 * 自選股與對話紀錄只存在該 id 名下（規格第十一節：個人資料預設只存於其帳號下）。
 * 接入正式登入（NextAuth / Supabase Auth）時，只需改寫 getUserId。
 */
import { cookies } from 'next/headers';

export const UID_COOKIE = 'sfl_uid';

export function getUserId(): string {
  try {
    const v = cookies().get(UID_COOKIE)?.value;
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return v;
  } catch {
    /* 非請求情境（排程、測試） */
  }
  return process.env.DEFAULT_USER_ID || 'demo';
}
