/**
 * SEC XBRL companyfacts（https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json）→ point-in-time 季資料。
 *
 * 每個 fact 有 start / end / val / filed / form / accn。同一期間會在後續申報中重複出現（比較期 / 重編），
 * 以「filed ≤ asOf 中最新的一筆」作為 asOf 當時可得的最佳數值；filed > asOf 的 fact 一律忽略。
 * 季值：期間 80–100 天的 fact 直接採用；沒有時以同一起點的累計值相減（例如 Q4 = 全年 − 9 個月），標記 derived。
 */
import type { FactValue, QuarterRecord } from './types';

export interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik?: number | string;
  entityName?: string;
  facts?: Record<string, Record<string, { label?: string; units?: Record<string, XbrlFact[]> }>>;
}

const ALLOWED_FORMS = /^(10-Q|10-K|10-QT|10-KT|20-F|40-F|6-K|8-K)(\/A)?$/;

export const CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  shares: ['CommonStockSharesOutstanding'],
  dps: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'],
} as const;

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

function unitFacts(cf: CompanyFacts, taxonomy: string, concept: string): XbrlFact[] | null {
  const c = cf.facts?.[taxonomy]?.[concept];
  if (!c?.units) return null;
  const key = Object.keys(c.units).find((u) => u === 'USD' || u === 'USD/shares' || u === 'shares') ?? Object.keys(c.units)[0];
  return key ? c.units[key] : null;
}

/** 只保留 asOf 當時已申報的 fact */
export function knownFacts(facts: XbrlFact[], asOf: string): XbrlFact[] {
  return facts.filter((f) => typeof f.val === 'number' && Number.isFinite(f.val) && f.filed && f.filed <= asOf && (!f.form || ALLOWED_FORMS.test(f.form)));
}

/** 同期間（start,end）：數值取 filed 最新者（含重編），firstFiled 為該期間「第一次」公開的日期 */
function latestByPeriod(facts: XbrlFact[]): Map<string, XbrlFact & { firstFiled: string }> {
  const m = new Map<string, XbrlFact & { firstFiled: string }>();
  for (const f of facts) {
    const k = `${f.start ?? ''}|${f.end}`;
    const prev = m.get(k);
    const firstFiled = prev && prev.firstFiled < f.filed ? prev.firstFiled : f.filed;
    if (!prev || f.filed > prev.filed || (f.filed === prev.filed && (f.accn ?? '') > (prev.accn ?? ''))) m.set(k, { ...f, firstFiled });
    else prev.firstFiled = firstFiled;
  }
  return m;
}

/** 期間型概念 → 以季底日期為鍵的季值 */
export function quarterlyDurations(facts: XbrlFact[], asOf: string): Map<string, FactValue> {
  const known = [...latestByPeriod(knownFacts(facts, asOf).filter((f) => f.start)).values()];
  const q = new Map<string, FactValue>();
  for (const f of known) {
    const d = days(f.start!, f.end);
    if (d >= 80 && d <= 100) q.set(f.end, { value: f.val, knownAt: f.firstFiled, lastFiled: f.filed, basis: 'filed', form: f.form, accn: f.accn });
  }
  // 同一起點的累計值相減
  const byStart = new Map<string, (XbrlFact & { firstFiled: string })[]>();
  for (const f of known) {
    const arr = byStart.get(f.start!) ?? [];
    arr.push(f);
    byStart.set(f.start!, arr);
  }
  for (const arr of byStart.values()) {
    arr.sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 1; i < arr.length; i++) {
      const gap = days(arr[i - 1].end, arr[i].end);
      if (gap < 80 || gap > 100 || q.has(arr[i].end)) continue;
      // 兩個累計值都公開之後才算已知（取兩者第一次公開日的較晚者）
      const first = arr[i].firstFiled > arr[i - 1].firstFiled ? arr[i].firstFiled : arr[i - 1].firstFiled;
      const last = arr[i].filed > arr[i - 1].filed ? arr[i].filed : arr[i - 1].filed;
      q.set(arr[i].end, { value: arr[i].val - arr[i - 1].val, knownAt: first, lastFiled: last, basis: 'filed', derived: true, form: arr[i].form, accn: arr[i].accn });
    }
  }
  return q;
}

/** 時點型概念（權益、股數）→ 每個期末的最新值 */
export function instants(facts: XbrlFact[], asOf: string): Map<string, FactValue> {
  const m = new Map<string, FactValue>();
  for (const f of latestByPeriod(knownFacts(facts, asOf).filter((x) => !x.start)).values()) m.set(f.end, { value: f.val, knownAt: f.firstFiled, lastFiled: f.filed, basis: 'filed', form: f.form, accn: f.accn });
  return m;
}

/** 依候選概念優先序合併（公司會隨年度改用不同概念，例如 SalesRevenueNet → RevenueFromContract…） */
function mergedConcept(cf: CompanyFacts, names: readonly string[], build: (f: XbrlFact[]) => Map<string, FactValue>, taxonomy = 'us-gaap'): { map: Map<string, FactValue>; used: string[] } {
  const map = new Map<string, FactValue>();
  const used: string[] = [];
  for (const n of names) {
    const f = unitFacts(cf, taxonomy, n);
    if (!f?.length) continue;
    const m = build(f);
    let added = false;
    for (const [k, v] of m) {
      if (map.has(k)) continue;
      map.set(k, v);
      added = true;
    }
    if (added) used.push(n);
  }
  return { map, used };
}

function calLabel(end: string): string {
  const y = Number(end.slice(0, 4));
  const m = Number(end.slice(5, 7));
  const d = Number(end.slice(8, 10));
  // 季底落在月初幾天者（例如 52/53 週會計年度）歸到前一個月
  const mm = d <= 7 ? (m === 1 ? 12 : m - 1) : m;
  const yy = d <= 7 && m === 1 ? y - 1 : y;
  return `${yy}Q${Math.floor((mm - 1) / 3) + 1}`;
}

export interface SecFundamentals {
  entityName: string;
  quarters: QuarterRecord[];
  conceptsUsed: Record<string, string | null>;
  dps: Map<string, FactValue>;
  latestShares: FactValue & { end: string } | null;
}

/** companyfacts → asOf 當時已知的季資料（依期末排序） */
export function parseCompanyFacts(cf: CompanyFacts, asOf: string): SecFundamentals {
  const used: Record<string, string | null> = {};
  const dur = (key: keyof typeof CONCEPTS) => {
    const c = mergedConcept(cf, CONCEPTS[key], (f) => quarterlyDurations(f, asOf));
    used[key] = c.used.join(' + ') || null;
    return c.map;
  };
  const inst = (key: keyof typeof CONCEPTS) => {
    const c = mergedConcept(cf, CONCEPTS[key], (f) => instants(f, asOf));
    used[key] = c.used.join(' + ') || null;
    return c.map;
  };
  const revenue = dur('revenue');
  const gp = dur('grossProfit');
  const op = dur('operatingIncome');
  const ni = dur('netIncome');
  const eps = dur('eps');
  const ocf = dur('operatingCashFlow');
  const dps = dur('dps');
  const eq = inst('equity');
  const sh = inst('shares');
  const dei = unitFacts(cf, 'dei', 'EntityCommonStockSharesOutstanding');
  const deiShares = dei ? instants(dei, asOf) : new Map<string, FactValue>();

  const ends = new Set<string>([...revenue.keys(), ...ni.keys(), ...eps.keys()]);
  const nearest = (m: Map<string, FactValue>, end: string): FactValue | null => {
    const exact = m.get(end);
    if (exact) return exact;
    for (const [k, v] of m) if (Math.abs(days(k, end)) <= 7) return v;
    return null;
  };
  const quarters: QuarterRecord[] = [...ends]
    .sort()
    .map((end) => {
      const fields = { revenue: revenue.get(end), grossProfit: gp.get(end), operatingIncome: op.get(end), netIncome: ni.get(end), eps: eps.get(end), operatingCashFlow: ocf.get(end), equity: nearest(eq, end), shares: nearest(sh, end) ?? nearest(deiShares, end) };
      // 季資料的公開日：核心損益欄位第一次公開日的最晚者（權益 / 股數等時點值不影響）
      const core = [fields.revenue, fields.netIncome, fields.eps].filter((v): v is FactValue => !!v);
      const vals = core.length ? core : Object.values(fields).filter((v): v is FactValue => !!v);
      const knownAt = vals.reduce((m, v) => (v.knownAt > m ? v.knownAt : m), '');
      return {
        periodEnd: end,
        label: calLabel(end),
        knownAt,
        basis: 'filed' as const,
        revenue: fields.revenue?.value ?? null,
        grossProfit: fields.grossProfit?.value ?? null,
        operatingIncome: fields.operatingIncome?.value ?? null,
        netIncome: fields.netIncome?.value ?? null,
        eps: fields.eps?.value ?? null,
        operatingCashFlow: fields.operatingCashFlow?.value ?? null,
        equity: fields.equity?.value ?? null,
        shares: fields.shares?.value ?? null,
        derivedFields: Object.entries(fields)
          .filter(([, v]) => v?.derived)
          .map(([k]) => k),
      };
    });
  let latestShares: SecFundamentals['latestShares'] = null;
  for (const m of [deiShares, sh]) {
    for (const [end, v] of m) if (!latestShares || end > latestShares.end) latestShares = { ...v, end };
    if (latestShares) break;
  }
  return { entityName: cf.entityName ?? '', quarters, conceptsUsed: used, dps, latestShares };
}
