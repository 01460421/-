/** 繁體中文字串（預設語系）。新增語系：複製此檔為 en.ts 並在 index.ts 註冊。 */
export const zhTW = {
  appName: '股價數學擬合實驗台',
  appTagline: '可解釋的數學擬合 · 即時修正 · 基準對照 · 歷史準度回顧',
  nav: { home: '首頁', dashboard: '追蹤儀表板', accuracy: '歷史準度回顧', health: '系統健康', events: '事件日誌', watchlist: '自選股', privacy: '個人資料' },
  market: { open: '盤中', closed: '收盤', pre: '盤前', holiday: '休市' },
  disclaimerTitle: '使用前請閱讀',
  disclaimer:
    '本工具為數學擬合與統計方法的教學與研究用途，所有預測與 AI 分析均為基於歷史資料的數學外推，不構成任何投資建議；過去擬合表現不代表未來結果。資料來源各依其授權條款使用，外部網站僅以連結或官方嵌入工具呈現。',
  disclaimerAccept: '我已了解',
  aiLabel: 'AI 分析，非投資建議',
  signal: { up: '看漲', down: '看跌', neutral: '觀望' },
  common: {
    source: '資料來源',
    asOf: '資料時間',
    delay: '延遲',
    minutes: '分鐘',
    stale: '快取資料（資料源暫時無法連線）',
    loading: '計算中…',
    exportCsv: '匯出 CSV',
    exportJson: '匯出 JSON',
    exportPng: '匯出 PNG',
    exportPdf: '匯出 PDF',
    resetAuto: '重設為自動選擇',
  },
} as const;

export type Dict = typeof zhTW;
