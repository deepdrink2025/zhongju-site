import { honors } from '../data/company';
import SectionHeading from './SectionHeading';

/** ⑥ 荣誉资质：明亮奖牌墙 + 文字胶囊 */
export default function Honors() {
  const withImg = honors.filter((h) => h.img);
  const textOnly = honors.filter((h) => !h.img);

  return (
    <section id="honors" className="bg-neutral-50 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          eyebrow="Honors"
          title="荣誉与资质"
          desc="行业与客户的持续认可，是我们前进的动力。"
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {withImg.map((h) => (
            <figure
              key={h.name}
              className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-neutral-900 hover:shadow-card-hover"
            >
              <div className="overflow-hidden">
                <img
                  src={h.img}
                  alt={h.name}
                  className="h-32 w-full object-cover transition duration-700 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <figcaption className="px-3.5 py-3 text-center text-xs font-medium leading-snug text-neutral-600">
                {h.name}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {textOnly.map((h) => (
            <span
              key={h.name}
              className="rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-600 shadow-sm transition hover:border-butter-600 hover:text-butter-600"
            >
              {h.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
