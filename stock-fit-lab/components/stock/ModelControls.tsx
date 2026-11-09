'use client';
/**
 * 模型與修正層控制：模型逐一開關（計算 / 顯示）、說明抽屜、四層修正開關、視窗 N 與 λ、
 * 參數工作區（paramSpecs，300 ms 防抖）、使用者自訂基準。
 */
import { useState } from 'react';
import ParamWorkspace from '@/components/ParamWorkspace';
import type { LayerToggles } from '@/lib/engine/types';
import type { ModelDescription, ModelId } from '@/lib/types';
import type { AnalyzePayload, ModelMetaLite } from './types';
import { fmtNum, fmtPct, modelColor } from './util';

const LAYERS: { key: keyof LayerToggles; label: string; help: string }[] = [
  { key: 'rollingRefit', label: '① 滾動視窗重擬合', help: '以最近 N 筆 + 衰減權重 w_i = λ^(T−i) 重新擬合' },
  { key: 'rls', label: '② 遞迴最小平方 RLS', help: '多項式 / 線性類模型線上更新，不重算整個矩陣' },
  { key: 'kalman', label: '③ 卡爾曼預測—更新', help: '顯示增益 K_t；殘差連三期 > 2σ 觸發結構性變化警示並放大 Q' },
  { key: 'ensembleReweight', label: '④ 集成權重再分配', help: 'w_m ∝ ē_m⁻²；方向準確率 < 50% 連續 10 期暫時歸零' },
];

export default function ModelControls({
  payload,
  meta,
  advanced,
  enabled,
  visible,
  layers,
  window,
  lambda,
  params,
  customTarget,
  onEnabled,
  onVisible,
  onLayers,
  onWindow,
  onLambda,
  onParams,
  onCustomTarget,
  onOpenDrawer,
}: {
  payload: AnalyzePayload | null;
  meta: ModelMetaLite[];
  advanced: boolean;
  enabled: ModelId[];
  visible: ModelId[];
  layers: LayerToggles;
  window: number;
  lambda: number;
  params: Partial<Record<ModelId, Record<string, number>>>;
  customTarget: number | null;
  onEnabled: (ids: ModelId[]) => void;
  onVisible: (ids: ModelId[]) => void;
  onLayers: (l: LayerToggles) => void;
  onWindow: (n: number) => void;
  onLambda: (l: number) => void;
  onParams: (p: Partial<Record<ModelId, Record<string, number>>>) => void;
  onCustomTarget: (v: number | null) => void;
  onOpenDrawer: (d: ModelDescription) => void;
}) {
  const [paramModel, setParamModel] = useState<ModelId>('poly');
  const [winLocal, setWinLocal] = useState<number | null>(null);
  const [lamLocal, setLamLocal] = useState<number | null>(null);
  const list = meta.filter((m) => advanced || !m.advanced);
  const res = payload?.result;
  const specs = res?.results[paramModel]?.description?.paramSpecs ?? [];
  const toggle = (arr: ModelId[], id: ModelId) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const commitWin = (v: number) => {
    setWinLocal(null);
    onWindow(v);
  };
  const commitLam = (v: number) => {
    setLamLocal(null);
    onLambda(v);
  };

  return (
    <section className="panel space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="h2">模型</h2>
          <span className="text-xs muted">勾選 = 計算；👁 = 圖上顯示</span>
        </div>
        <ul className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
          {list.map((m) => {
            const r = res?.results[m.id];
            const on = enabled.includes(m.id);
            const w = res?.ensembleWeights[m.id];
            const zeroed = res?.weightStatus[m.id]?.zeroed;
            return (
              <li key={m.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={on} onChange={() => onEnabled(toggle(enabled, m.id))} aria-label={`計算 ${m.name}`} />
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: modelColor(m.id) }} />
                <button className={`min-w-0 flex-1 truncate text-left ${visible.includes(m.id) && on ? '' : 'opacity-50'}`} onClick={() => on && onVisible(toggle(visible, m.id))} title={on ? '切換圖上顯示' : '先勾選以計算'}>
                  {visible.includes(m.id) && on ? '👁 ' : '　 '}
                  {m.short}
                  {m.advanced && <span className="chip ml-1 px-1 py-0 text-[10px]">進階</span>}
                </button>
                {r && !r.ok && <span className="text-[10px] text-red-500" title={r.error}>失敗</span>}
                {zeroed && <span className="text-[10px] text-amber-600" title={res?.weightStatus[m.id]?.reason}>歸零</span>}
                {w !== undefined && !zeroed && <span className="text-[10px] tabular-nums muted" title="集成權重">{fmtPct(w, 0)}</span>}
                {r?.direction && <span className="text-[10px] tabular-nums muted" title={`P(上漲) h=${res?.horizon}`}>P↑{fmtNum(r.direction.pUp * 100, 0)}</span>}
                {r?.description && (
                  <button className="text-xs text-blue-600 hover:underline" onClick={() => onOpenDrawer(r.description!)} aria-label={`${m.name} 說明`}>
                    ⓘ
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          <button className="btn text-xs" onClick={() => onVisible(enabled)}>
            全部顯示
          </button>
          <button className="btn text-xs" onClick={() => onVisible(enabled.filter((x) => x === 'ensemble'))}>
            只看集成
          </button>
          {advanced && <span className="muted">進階模型較慢（GP、Stacking），建議只開需要的。</span>}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">即時修正四層（可逐層開關）</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {LAYERS.map((l) => (
            <label key={l.key} className="flex items-start gap-1.5 text-xs" title={l.help}>
              <input type="checkbox" checked={layers[l.key]} onChange={(e) => onLayers({ ...layers, [l.key]: e.target.checked })} />
              <span>
                {l.label}
                <span className="block text-[10px] muted">{l.help}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            滾動視窗 N = <b>{winLocal ?? window}</b>
            <input
              type="range"
              className="w-full"
              min={30}
              max={500}
              step={10}
              value={winLocal ?? window}
              onChange={(e) => setWinLocal(Number(e.target.value))}
              onMouseUp={(e) => commitWin(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitWin(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commitWin(Number((e.target as HTMLInputElement).value))}
              aria-label="滾動視窗 N"
            />
          </label>
          <label className="text-xs">
            衰減係數 λ = <b>{(lamLocal ?? lambda).toFixed(3)}</b>
            <input
              type="range"
              className="w-full"
              min={0.9}
              max={1}
              step={0.005}
              value={lamLocal ?? lambda}
              onChange={(e) => setLamLocal(Number(e.target.value))}
              onMouseUp={(e) => commitLam(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitLam(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commitLam(Number((e.target as HTMLInputElement).value))}
              aria-label="衰減係數 λ"
            />
          </label>
        </div>
        <p className="text-[10px] muted">w_i = λ^(T−i)：λ 越小越重視近期資料；λ = 1 為等權。</p>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-sm font-medium">參數工作區</h3>
          <select className="input text-xs" value={paramModel} onChange={(e) => setParamModel(e.target.value as ModelId)} aria-label="選擇模型參數">
            {list
              .filter((m) => m.id !== 'ensemble' && enabled.includes(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.short}
                </option>
              ))}
          </select>
        </div>
        {specs.length ? (
          <ParamWorkspace
            specs={specs}
            values={params[paramModel] ?? {}}
            onChange={(v) => {
              const next = { ...params };
              if (Object.keys(v).length) next[paramModel] = v;
              else delete next[paramModel];
              onParams(next);
            }}
          />
        ) : (
          <p className="text-xs muted">{enabled.includes(paramModel) ? '此模型沒有可調參數，或尚未計算完成。' : '請先勾選此模型。'}</p>
        )}
        {Object.keys(params).length > 0 && (
          <button className="btn mt-1 text-xs" onClick={() => onParams({})}>
            全部模型重設為自動選擇
          </button>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">使用者自訂基準</h3>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="number"
            className="input w-28"
            placeholder="目標價"
            defaultValue={customTarget ?? ''}
            min={0}
            onBlur={(e) => {
              const v = Number(e.target.value);
              onCustomTarget(e.target.value && Number.isFinite(v) && v > 0 ? v : null);
            }}
            aria-label="自訂基準目標價"
          />
          <span className="muted">輸入自己的目標價或券商預估，於預測期末線性到達，作為外部基準並排比較。</span>
        </div>
      </div>
    </section>
  );
}
