'use client';
import type { ModelDescription } from '@/lib/types';
import Tex, { RichTex } from './Tex';

/** 模型說明抽屜：公式推導、適用情境、常見失效情境、已擬合參數與診斷值 */
export default function ModelDrawer({ desc, onClose }: { desc: ModelDescription | null; onClose: () => void }) {
  if (!desc) return null;
  const fmt = (v: unknown): string => {
    if (typeof v === 'number') return Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : v.toFixed(4).replace(/\.?0+$/, '');
    if (Array.isArray(v)) return v.length > 12 ? `[${v.slice(0, 12).map(fmt).join(', ')}, …]（共 ${v.length}）` : `[${v.map(fmt).join(', ')}]`;
    return String(v);
  };
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="panel h-full w-full max-w-xl overflow-y-auto rounded-none p-5" onClick={(e) => e.stopPropagation()} aria-label={`${desc.name} 說明`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{desc.name}</h2>
            <p className="text-xs muted">
              {desc.id} · v{desc.version}
            </p>
          </div>
          <button className="btn" onClick={onClose}>
            關閉
          </button>
        </div>
        <div className="my-4 overflow-x-auto rounded border p-3" style={{ borderColor: 'var(--border)' }}>
          <Tex tex={desc.formulaLatex} display />
        </div>
        <h3 className="h2 mt-4">推導</h3>
        <p className="mt-1 text-sm leading-relaxed">
          <RichTex text={desc.derivation} />
        </p>
        <h3 className="h2 mt-4">適用情境</h3>
        <p className="mt-1 text-sm">{desc.useCases}</p>
        <h3 className="h2 mt-4">常見失效情境</h3>
        <p className="mt-1 text-sm">{desc.failureModes}</p>
        <h3 className="h2 mt-4">目前參數</h3>
        <table className="table-std mt-1">
          <tbody>
            {Object.entries(desc.params).map(([k, v]) => (
              <tr key={k}>
                <td className="font-mono">{k}</td>
                <td className="break-all">{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="h2 mt-4">診斷</h3>
        <table className="table-std mt-1">
          <tbody>
            {Object.entries(desc.diagnostics).map(([k, v]) => (
              <tr key={k}>
                <td className="font-mono">{k}</td>
                <td className="break-all">{fmt(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  );
}
