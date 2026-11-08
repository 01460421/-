/** 新聞 / 公告測試用的擬真回應（格式取自各官方端點的實際回應結構，內容為測試用） */

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export function textResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
}

/** 公開資訊觀測站 ajax_t05st01 回應（歷史重大訊息，113 年 1 月） */
export const mopsT05st01Html = `
<html><body>
<form name="fm_t05st01" method="post">
<input type="hidden" name="seq_no"><input type="hidden" name="spoke_time"><input type="hidden" name="spoke_date">
<table class='hasBorder'>
<tr class='tblHead'><th>公司代號</th><th>公司名稱</th><th>發言日期</th><th>發言時間</th><th>主旨</th><th>&nbsp;</th></tr>
<tr class='even'><td style='text-align:left !important;'>2330</td><td>台積電</td><td>113/01/18</td><td>16:36:34</td>
<td style='text-align:left !important;'>本公司代子公司 TSMC Global Ltd. 公告取得固定收益證券</td>
<td><input type='button' value='詳細資料' onclick="document.fm_t05st01.seq_no.value='2';document.fm_t05st01.spoke_time.value='163634';document.fm_t05st01.spoke_date.value='20240118';openWindow(this.form ,'');"></td></tr>
<tr class='odd'><td style='text-align:left !important;'>2330</td><td>台積電</td><td>113/01/18</td><td>14:00:12</td>
<td style='text-align:left !important;'>公告本公司董事會通過資本預算及 112 年第四季現金股利分派&amp;相關事宜</td>
<td><input type='button' value='詳細資料' onclick="document.fm_t05st01.seq_no.value='1';document.fm_t05st01.spoke_time.value='140012';document.fm_t05st01.spoke_date.value='20240118';openWindow(this.form ,'');"></td></tr>
<tr class='even'><td style='text-align:left !important;'>2330</td><td>台積電</td><td>113/01/30</td><td>17:10:00</td>
<td style='text-align:left !important;'>本公司受邀參加法人說明會</td>
<td><input type='button' value='詳細資料' onclick="document.fm_t05st01.seq_no.value='1';openWindow(this.form ,'');"></td></tr>
</table>
</form></body></html>`;

export const mopsBlockedHtml = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>
因為安全性考量，您所執行的頁面無法呈現。<BR>FOR SECURITY REASONS, THIS PAGE CAN NOT BE ACCESSED.<BR>錯誤代碼：123</body></html>`;

export const mopsEmptyHtml = `<html><body><center><h3>查無所需資料！</h3></center></body></html>`;

/** 法人說明會 t100sb02_1 回應 */
export const mopsConferenceHtml = `
<table class='hasBorder'>
<tr><th>公司代號</th><th>公司名稱</th><th>召開法人說明會日期</th><th>召開法人說明會時間</th><th>召開法人說明會地點</th><th>法人說明會擇要訊息</th><th>法人說明會簡報內容</th></tr>
<tr class='even'><td>2330</td><td>台積電</td><td>113/01/18</td><td>14:00</td><td>台北君悅酒店</td><td>本公司將於113年1月18日召開法人說明會，說明112年第四季營運成果</td>
<td><a href='/nas/STR/233020240118M001.pdf' target='_blank'>中文檔案</a></td></tr>
</table>`;

/** TWSE OpenAPI t187ap04_L（注意「主旨 」欄名尾端有空白，與實際回應相同） */
export const twseAp04 = [
  { 出表日期: '1130119', 發言日期: '1130118', 發言時間: '163634', 公司代號: '2330', 公司名稱: '台積電', '主旨 ': '本公司代子公司公告取得固定收益證券', 符合條款: '第20款', 事實發生日: '1130118', 說明: '1.事實發生日：113/01/18 2.內文很長的說明全文（不得保存）' },
  { 出表日期: '1130119', 發言日期: '1130118', 發言時間: '70003', 公司代號: '2317', 公司名稱: '鴻海', '主旨 ': '公告本公司董事會決議事項', 符合條款: '第11款', 事實發生日: '1130118', 說明: '…' },
];

/** FinMind TaiwanStockNews（一天） */
export const finmindNewsDay = (date: string) => ({
  msg: 'success',
  status: 200,
  data: [
    { date: `${date} 08:10:00`, stock_id: '2330', link: 'https://news.google.com/rss/articles/abc1?oc=5', source: '經濟日報', title: '台積電法說會釋利多 今年營收看增 - 經濟日報' },
    { date: `${date} 09:30:00`, stock_id: '2330', link: 'https://news.google.com/rss/articles/abc2?oc=5', source: 'Yahoo奇摩股市', title: '台積電股價攀升重登月線 - Yahoo奇摩股市' },
    { date: `${date} 21:00:00`, stock_id: '2330', link: 'https://news.google.com/rss/articles/abc3?oc=5', source: '中央社', title: '台積電資本支出下修 外資降評 - 中央社' },
  ],
});

/** SEC submissions（精簡自 CIK0000320193.json 的結構） */
export const secSubmissions = {
  cik: '320193',
  name: 'Apple Inc.',
  tickers: ['AAPL'],
  filings: {
    recent: {
      accessionNumber: ['0000320193-24-000069', '0000320193-24-000067', '0000320193-24-000006', '0000320193-24-000005', '0001140361-24-000111'],
      filingDate: ['2024-05-03', '2024-05-02', '2024-02-02', '2024-02-01', '2024-01-20'],
      reportDate: ['2024-03-30', '2024-05-02', '2023-12-30', '2024-02-01', ''],
      acceptanceDateTime: ['2024-05-03T10:01:00.000Z', '2024-05-02T20:30:21.000Z', '2024-02-02T11:00:00.000Z', '2024-02-01T21:30:30.000Z', '2024-01-20T01:00:00.000Z'],
      form: ['10-Q', '8-K', '10-Q', '8-K', '4'],
      items: ['', '2.02,9.01', '', '2.02,9.01', ''],
      primaryDocument: ['aapl-20240330.htm', 'aapl-20240502.htm', 'aapl-20231230.htm', 'aapl-20240201.htm', 'xslF345X05/wf-form4.xml'],
      primaryDocDescription: ['10-Q', '8-K', '10-Q', '8-K', 'FORM 4'],
    },
    files: [{ name: 'CIK0000320193-submissions-001.json', filingCount: 1271, filingFrom: '1994-01-26', filingTo: '2015-10-03' }],
  },
};

export const secTickers = { '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, '1': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' } };

/** EDGAR 全文檢索回應 */
export const eftsResponse = {
  took: 23,
  hits: {
    total: { value: 2, relation: 'eq' },
    hits: [
      { _id: '0000320193-24-000005:a8-kex991q1202412302023.htm', _source: { ciks: ['0000320193'], form: '8-K', root_forms: ['8-K'], file_type: 'EX-99.1', file_description: 'EX-99.1', file_date: '2024-02-01', period_ending: '2024-02-01', items: ['2.02', '9.01'], display_names: ['Apple Inc.  (AAPL)  (CIK 0000320193)'] } },
      { _id: '0000320193-24-000006:aapl-20231230.htm', _source: { ciks: ['0000320193'], form: '10-Q', root_forms: ['10-Q'], file_type: '10-Q', file_description: '10-Q', file_date: '2024-02-02', period_ending: '2023-12-30', items: [], display_names: ['Apple Inc.  (AAPL)  (CIK 0000320193)'] } },
    ],
  },
};

/** GDELT DOC 2.0 artlist 回應 */
export const gdeltArticles = {
  articles: [
    { url: 'https://www.reuters.com/technology/tsmc-q4-2024-01-18/', url_mobile: '', title: 'TSMC forecasts strong growth as AI demand surges', seendate: '20240118T063000Z', socialimage: '', domain: 'reuters.com', language: 'English', sourcecountry: 'United States' },
    { url: 'https://asia.nikkei.com/Business/Tech/TSMC-capex', title: 'TSMC cuts capex plan amid weak smartphone demand', seendate: '20240117T020000Z', domain: 'asia.nikkei.com', language: 'English', sourcecountry: 'Japan' },
    { url: 'https://randomblog.example.com/tsmc', title: 'TSMC to the moon', seendate: '20240118T010000Z', domain: 'randomblog.example.com', language: 'English', sourcecountry: 'United States' },
    { url: 'https://www.reuters.com/technology/tsmc-future/', title: 'TSMC news published after asOf', seendate: '20240125T010000Z', domain: 'reuters.com', language: 'English', sourcecountry: 'United States' },
  ],
};
