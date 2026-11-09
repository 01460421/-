/**
 * /stock/[symbol]：單檔分析頁（伺服器元件只渲染外殼與深連結初始狀態，計算由前端呼叫 /api/analyze）。
 * 深連結：/stock/2330.TW?models=poly3,kalman&h=20&window=120&lambda=0.97&range=1y&priceMode=log&advanced=1
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ModelId } from '@/lib/types';
import { parseDeepLink } from '@/lib/integrations/deeplink';
import { toTradingViewSymbol } from '@/lib/integrations/tradingview';
import { lookupName, normalizeSymbol } from '@/lib/data-adapters/symbols';
import { ALL_MODEL_IDS, BASIC_IDS, MODEL_META, isAdvanced } from '@/lib/models';
import StockWorkspace, { type InitialState } from '@/components/stock/StockWorkspace';
import type { ModelMetaLite, RangeKey } from '@/components/stock/types';

export const dynamic = 'force-dynamic';

type Props = { params: { symbol: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  const info = normalizeSymbol(decodeURIComponent(params.symbol));
  const name = info ? info.name ?? lookupName(info.symbol) : undefined;
  return { title: info ? `${info.symbol}${name ? ` ${name}` : ''} 擬合分析` : '代號無法辨識' };
}

const RANGE_OK: RangeKey[] = ['3m', '6m', '1y', '2y', '5y'];

export default function StockPage({ params, searchParams }: Props) {
  const { state, warnings } = parseDeepLink(params.symbol, searchParams);
  if (!state) {
    return (
      <div className="panel mx-auto max-w-lg space-y-2 text-center">
        <h1 className="text-lg font-semibold">無法辨識代號</h1>
        <p className="text-sm muted">{warnings.join('；')}。支援 2330.TW、6488.TWO、AAPL、台積電 等格式。</p>
        <Link href="/" className="btn-primary">
          回首頁
        </Link>
      </div>
    );
  }
  const info = normalizeSymbol(state.symbol)!;
  const advanced = searchParams.advanced === '1' || state.models.some((m) => isAdvanced(m.id));
  const given = state.models.map((m) => m.id);
  const models: ModelId[] = given.length ? (given.includes('ensemble') ? given : [...given, 'ensemble']) : [...BASIC_IDS];
  const visible: ModelId[] = given.length ? given : ['poly', 'holtwinters', 'arima', 'kalman', 'linchannel', 'ensemble'];
  const p: InitialState['params'] = {};
  for (const m of state.models) if (m.param !== undefined && m.paramKey && m.paramKey !== 'main') p[m.id] = { [m.paramKey]: m.param };
  const range: RangeKey = typeof state.range === 'string' && (RANGE_OK as string[]).includes(state.range) ? (state.range as RangeKey) : '1y';
  if (state.range && range === '1y' && state.range !== '1y') warnings.push('區間僅支援 3m / 6m / 1y / 2y / 5y，已改用 1y');

  const initial: InitialState = {
    symbol: info.symbol,
    name: info.name ?? lookupName(info.symbol),
    market: info.market,
    tvSymbol: toTradingViewSymbol(info.symbol),
    range,
    horizon: state.h ?? 20,
    window: state.window ?? 120,
    lambda: state.lambda ?? 0.97,
    priceMode: state.priceMode ?? 'raw',
    models,
    visible,
    params: p,
    advanced,
    warnings,
  };
  const meta: ModelMetaLite[] = ALL_MODEL_IDS.map((id) => ({ id, name: MODEL_META[id].name, short: MODEL_META[id].short, advanced: MODEL_META[id].advanced, formulaLatex: MODEL_META[id].formulaLatex }));
  return <StockWorkspace key={info.symbol} initial={initial} meta={meta} />;
}
