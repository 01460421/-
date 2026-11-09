'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as echarts from 'echarts';

export interface EChartHandle {
  instance: () => echarts.ECharts | null;
  toPng: (filename?: string) => void;
}

interface Props {
  option: echarts.EChartsOption;
  height?: number | string;
  /** 多圖聯動群組名（echarts.connect） */
  group?: string;
  onEvents?: Record<string, (params: any) => void>;
  className?: string;
  notMerge?: boolean;
}

function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/** ECharts 薄封裝：支援深色模式、resize、群組聯動、PNG 匯出 */
const EChart = forwardRef<EChartHandle, Props>(function EChart({ option, height = 360, group, onEvents, className, notMerge = true }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const optRef = useRef(option);
  optRef.current = option;

  useImperativeHandle(ref, () => ({
    instance: () => chart.current,
    toPng: (filename = 'chart.png') => {
      if (!chart.current) return;
      const url = chart.current.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: isDark() ? '#161b22' : '#ffffff' });
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    },
  }));

  useEffect(() => {
    if (!el.current) return;
    const init = () => {
      chart.current?.dispose();
      chart.current = echarts.init(el.current!, isDark() ? 'dark' : undefined, { renderer: 'canvas' });
      chart.current.setOption({ backgroundColor: 'transparent', ...optRef.current }, true);
      if (group) {
        chart.current.group = group;
        echarts.connect(group);
      }
      if (onEvents) for (const [k, fn] of Object.entries(onEvents)) chart.current.on(k, fn);
    };
    init();
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current);
    const onTheme = () => init();
    window.addEventListener('sfl-theme', onTheme);
    return () => {
      ro.disconnect();
      window.removeEventListener('sfl-theme', onTheme);
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  useEffect(() => {
    chart.current?.setOption({ backgroundColor: 'transparent', ...option }, notMerge);
  }, [option, notMerge]);

  return <div ref={el} className={className} style={{ width: '100%', height }} />;
});

export default EChart;
