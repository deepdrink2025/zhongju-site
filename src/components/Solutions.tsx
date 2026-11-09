import { solutions } from '../data/company';
import SectionHeading from './SectionHeading';
import Icon from './Icon';

/** ④ 六大业务板块：白卡 + 彩色图标轮换 + hover 深色描边 */
const iconStyles = [
  'bg-brand-500 text-white',
  'bg-butter text-neutral-900',
  'bg-lime text-neutral-900',
  'bg-violet text-white',
  'bg-pink text-white',
  'bg-sky text-white',
];

export default function Solutions() {
  return (
    <section id="solutions" className="bg-neutral-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          eyebrow="Solutions"
          title="六大业务板块"
          desc="一站式人力资源解决方案，覆盖企业用工全场景。"
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.map((s, i) => (
            <div
              key={s.id}
              className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-neutral-900 hover:shadow-card-hover"
            >
              {s.img ? (
                <div className="relative h-44 w-full overflow-hidden md:h-48">
                  <img
                    src={s.img}
                    alt={s.title}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-4 p-7 pb-0">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconStyles[i % iconStyles.length]}`}
                  >
                    <Icon name={s.icon as never} className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-bold tracking-tight text-neutral-900">
                    {s.title}
                  </h3>
                </div>
              )}

              <div className="flex flex-1 flex-col p-7">
                {s.img && (
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconStyles[i % iconStyles.length]}`}
                    >
                      <Icon name={s.icon as never} className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-bold tracking-tight text-neutral-900">
                      {s.title}
                    </h3>
                  </div>
                )}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-500">
                  {s.intro}
                </p>
                <ul className="mt-5 space-y-2.5 border-t border-neutral-100 pt-5">
                  {s.points.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-2.5 text-sm text-neutral-700"
                    >
                      <Icon
                        name="check"
                        className="mt-0.5 h-4 w-4 shrink-0 text-lime-600"
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
