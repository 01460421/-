import type { Metadata } from 'next';
import { ALL_MODEL_IDS } from '@/lib/models';
import { normalizeSymbol } from '@/lib/data-adapters/symbols';
import { modelNames } from '@/app/api/accuracy/_lib';
import { envTrackSymbols } from '@/app/api/dashboard/_data';
import { getStore } from '@/lib/storage';
import AccuracyClient, { type AccuracyFilters } from '@/components/accuracy/AccuracyClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '歷史準度回顧' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AccuracyPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const sym = one(searchParams.symbol);
  const initial: AccuracyFilters = {
    symbol: sym ? (normalizeSymbol(sym)?.symbol ?? '') : '',
    model: /^[a-z0-9_]{1,24}$/.test(one(searchParams.model)) ? one(searchParams.model) : '',
    horizon: ['1', '5', '10', '20'].includes(one(searchParams.horizon)) ? one(searchParams.horizon) : '',
    period: ['1m', '3m', '6m', '12m', 'custom'].includes(one(searchParams.period)) ? one(searchParams.period) : '3m',
    from: one(searchParams.from),
    to: one(searchParams.to),
    up: one(searchParams.up) || '0.65',
    down: one(searchParams.down) || '0.35',
  };
  let tracked: string[] = [];
  try {
    tracked = await (await getStore()).listAllTrackedSymbols();
  } catch {
    tracked = [];
  }
  const symbolOptions = [...new Set([...envTrackSymbols(), ...tracked])];
  const modelOptions = [...ALL_MODEL_IDS, 'naive', 'drift', 'sma20', 'sma60', 'ai'];
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-xl font-semibold">歷史準度回顧</h1>
        <p className="text-sm muted">
          回頭檢視「過去每一次預測到底準不準」。所有數據只來自當時真實寫入的預測快照與排程回填的實際值，不以現在的模型事後重算，避免前視偏誤。方向判斷為第一優先：計分卡預設依方向準確率、出手準確率與連續判對次數排序。
        </p>
      </header>
      <AccuracyClient initial={initial} modelOptions={modelOptions} symbolOptions={symbolOptions} names={modelNames()} />
    </div>
  );
}
