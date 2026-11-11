'use strict';
/* ---------- 可以自己改的設定 ---------- */

/* 共用後端的網址（接龍、展牆、共鳴、投票、雲端同步）。
   留空：先找同網域的 /api，找不到就只存在這台裝置。
   網站和後端不在同一個網域時，填後端的網址，例如 'https://你的專案.vercel.app'
   （同時要把這個網址加進 vercel.json 的 Content-Security-Policy connect-src）。 */
const API_URL='';

/* 原版紀錄片的網址。本館已經內建放映廳，這裡留空即可；
   填了之後，放映廳會多一個「另開原版」的連結。 */
const FILM_URL='';

/* 版本：改了檔案之後把它往上加，瀏覽器和離線快取才會換新。 */
const SITE_VERSION='2.0.0';
