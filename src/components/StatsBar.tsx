import { stats } from '../data/company';

/** ② 数字统计条：浅灰底 + 统一品牌色大数字（企业正规风格） */
export default function StatsBar() {
  return (
    <section
      id="stats"
      className="border-y border-neutral-100 bg-neutral-50 py-16 md:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid grid-cols-2 gap-y-10 md:grid-cols-3 lg:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="tnum text-2xl font-extrabold tracking-tight text-brand-500 md:text-3xl lg:text-4xl">
                {s.value}
              </div>
              <div className="mt-2 text-xs text-neutral-500 md:text-sm">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
