/** 分析頁載入骨架 */
export default function Loading() {
  return (
    <div className="space-y-3" aria-label="載入中">
      <div className="panel h-24 animate-pulse" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="panel h-[560px] animate-pulse" />
        <div className="space-y-3">
          <div className="panel h-64 animate-pulse" />
          <div className="panel h-72 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
