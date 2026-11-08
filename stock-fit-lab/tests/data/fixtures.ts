/** 依真實 API 回應格式手工製作的測試資料（不連網） */

export const finmindPrice = {
  msg: 'success',
  status: 200,
  data: [
    { date: '2026-06-08', stock_id: '2330', Trading_Volume: 30000000, Trading_money: 69000000000, open: 2290, max: 2310, min: 2280, close: 2300, spread: 10, Trading_turnover: 50000 },
    { date: '2026-06-09', stock_id: '2330', Trading_Volume: 28000000, Trading_money: 64000000000, open: 2300, max: 2310, min: 2290, close: 2305, spread: 5, Trading_turnover: 48000 },
    { date: '2026-06-10', stock_id: '2330', Trading_Volume: 31000000, Trading_money: 70000000000, open: 2290, max: 2295, min: 2250, close: 2255, spread: -50, Trading_turnover: 61000 },
    // 6/11 除息 6 元
    { date: '2026-06-11', stock_id: '2330', Trading_Volume: 25000000, Trading_money: 56000000000, open: 2249, max: 2260, min: 2240, close: 2250, spread: 1, Trading_turnover: 45000 },
    // 6/12 缺漏（API 未回傳）→ 應前值填補
    { date: '2026-06-15', stock_id: '2330', Trading_Volume: 0, Trading_money: 0, open: 0, max: 0, min: 0, close: 0, spread: 0, Trading_turnover: 0 },
    { date: '2026-06-16', stock_id: '2330', Trading_Volume: 33000000, Trading_money: 76000000000, open: 2300, max: 2320, min: 2295, close: 2310, spread: 60, Trading_turnover: 62000 },
  ],
};

export const finmindDividend = {
  msg: 'success',
  status: 200,
  data: [
    {
      date: '2026-05-14',
      stock_id: '2330',
      year: '114年第4季',
      StockEarningsDistribution: 0,
      StockStatutorySurplus: 0,
      StockExDividendTradingDate: '',
      CashEarningsDistribution: 6.0,
      CashStatutorySurplus: 0,
      CashExDividendTradingDate: '2026-06-11',
      CashDividendPaymentDate: '2026-07-09',
      AnnouncementDate: '2026-05-14',
    },
  ],
};

export const finmindLevelError = { msg: 'Your level is free. Please update your user level.', status: 400 };

export const finmindInstitutional = {
  msg: 'success',
  status: 200,
  data: [
    { date: '2026-11-05', stock_id: '2330', buy: 0, name: 'Foreign_Dealer_Self', sell: 0 },
    { date: '2026-11-05', stock_id: '2330', buy: 722215, name: 'Investment_Trust', sell: 264000 },
    { date: '2026-11-05', stock_id: '2330', buy: 530000, name: 'Dealer_self', sell: 354600 },
    { date: '2026-11-05', stock_id: '2330', buy: 1010926, name: 'Dealer_Hedging', sell: 264326 },
    { date: '2026-11-05', stock_id: '2330', buy: 41380366, name: 'Foreign_Investor', sell: 44692029 },
  ],
};

/** Yahoo chart（2 個交易日 + 1 筆 null，含 adjclose、除息事件） */
export const yahooChart = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          gmtoffset: -18000,
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 228.5,
          regularMarketTime: 1762549200,
          chartPreviousClose: 226.0,
        },
        timestamp: [1762180200, 1762266600, 1762353000, 1762439400],
        events: {
          dividends: { '1762266600': { amount: 0.26, date: 1762266600 } },
          splits: { '1598880600': { date: 1598880600, numerator: 4, denominator: 1, splitRatio: '4:1' } },
        },
        indicators: {
          quote: [
            {
              open: [225.1, 226.0, null, 227.5],
              high: [227.0, 228.2, null, 229.1],
              low: [224.5, 225.4, null, 226.8],
              close: [226.4, 227.9, null, 228.5],
              volume: [41000000, 38000000, null, 39500000],
            },
          ],
          adjclose: [{ adjclose: [226.14, 227.9, null, 228.5] }],
        },
      },
    ],
    error: null,
  },
};

export const yahooNotFound = { chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } };

/** TPEx 個股日成交資訊（逐月） */
export const tpexHistory = {
  date: '20261001',
  code: '6488',
  name: '環球晶',
  stat: 'ok',
  tables: [
    {
      title: '個股日成交資訊',
      subtitle: '6488 環球晶 115年10月',
      date: '20261001',
      fields: ['日 期', '成交張數', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌', '筆數'],
      data: [
        ['115/10/01', '24,330', '26,580,157', '1,055.00', '1,135.00', '1,045.00', '1,085.00', '50.00', '39,220'],
        ['115/10/02', '16,256', '18,622,066', '1,090.00', '1,190.00', '1,075.00', '1,190.00', '105.00', '30,486'],
        ['115/10/05', '18,983', '22,887,612', '1,220.00', '1,235.00', '1,175.00', '1,180.00', '-10.00', '38,341'],
      ],
      totalCount: 3,
    },
  ],
};

export const tpexDailyQuotes = [
  { Date: '1151106', SecuritiesCompanyCode: '6488', CompanyName: '環球晶', Close: '512.00', Change: '-38.00 ', Open: '508.00', High: '529.00', Low: '508.00', TradingShares: '14376531' },
  { Date: '1151106', SecuritiesCompanyCode: '5347', CompanyName: '世界', Close: '98.10', Change: '-2.00 ', Open: '99.00', High: '100.00', Low: '97.50', TradingShares: '20000000' },
];

export const tpexInstitutional = [
  {
    Date: '1151106',
    SecuritiesCompanyCode: '6488',
    CompanyName: '環球晶',
    'Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference': '-500000',
    'ForeignDealers-Difference': '1000',
    'ForeignInvestorsInclude MainlandAreaInvestors-Difference': '-499000',
    'SecuritiesInvestmentTrustCompanies-Difference': '20000',
    'Dealers-Difference': '-3000',
    TotalDifference: '-482000',
  },
];

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
