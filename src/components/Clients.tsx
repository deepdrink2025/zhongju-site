import { clientGroups } from '../data/company';
import SectionHeading from './SectionHeading';

/**
 * ⑧ 合作客户（明亮版）：
 * 双向无限跑马灯（仅公司/产品 logo）
 */
export default function Clients() {
  const all = clientGroups.flatMap((g) =>
    g.companies.map((c) => ({ name: c.name, logo: c.logo }))
  );
  const rowA = all.slice(0, Math.ceil(all.length / 2));
  const rowB = all.slice(Math.ceil(all.length / 2));

  const MarqueeRow = ({
    items,
    reverse = false,
  }: {
    items: { name: string; logo: string }[];
    reverse?: boolean;
  }) => (
    <div className="marquee-pause relative overflow-hidden">
      <div
        className={`flex w-max gap-4 ${reverse ? 'animate-marquee-reverse animate-marquee' : 'animate-marquee'}`}
      >
        {[...items, ...items].map((c, i) => (
          <div
            key={`${c.name}-${i}`}
            className="flex h-24 w-56 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-white px-5 shadow-card transition duration-300 hover:border-brand-500/40 hover:shadow-card-hover"
          >
            <img
              src={c.logo}
              alt={`${c.name} logo`}
              className="h-20 w-40 object-contain"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <section id="clients" className="overflow-hidden bg-neutral-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          eyebrow="Clients"
          title="他们都在与中聚合作"
          desc="汽车制造、电子、食品、物流、通信等行业 200 余家企业的共同选择（以下为部分客户）。"
        />
      </div>

      {/* 双向跑马灯 */}
      <div className="mt-12 space-y-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <MarqueeRow items={rowA} />
        <MarqueeRow items={rowB} reverse />
      </div>
    </section>
  );
}
