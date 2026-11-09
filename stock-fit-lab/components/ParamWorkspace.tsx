'use client';
import { useEffect, useRef, useState } from 'react';
import type { ParamSpec } from '@/lib/types';

/**
 * 參數工作區：滑桿與數值輸入並存，修改後 300 ms 防抖回呼；「重設為自動選擇」清除覆寫。
 */
export default function ParamWorkspace({
  specs,
  values,
  onChange,
  title,
}: {
  specs: ParamSpec[];
  values: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  title?: string;
}) {
  const [local, setLocal] = useState(values);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setLocal(values), [values]);

  const set = (k: string, v: number) => {
    const next = { ...local, [k]: v };
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 300);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {title && <h3 className="text-sm font-medium">{title}</h3>}
        <button
          className="btn text-xs"
          onClick={() => {
            setLocal({});
            onChange({});
          }}
        >
          重設為自動選擇
        </button>
      </div>
      {specs.map((s) => {
        const v = local[s.key] ?? s.default;
        return (
          <label key={s.key} className="block text-xs">
            <span className="flex justify-between">
              <span title={s.help}>{s.label}</span>
              {s.auto && local[s.key] === undefined && <span className="chip">自動</span>}
            </span>
            <span className="mt-1 flex items-center gap-2">
              <input type="range" className="flex-1" min={s.min} max={s.max} step={s.step} value={v} onChange={(e) => set(s.key, Number(e.target.value))} aria-label={s.label} />
              <input
                type="number"
                className="input w-20"
                min={s.min}
                max={s.max}
                step={s.step}
                value={v}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) set(s.key, Math.min(s.max, Math.max(s.min, n)));
                }}
              />
            </span>
          </label>
        );
      })}
    </div>
  );
}
