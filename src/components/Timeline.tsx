import { timeline } from '../data/company';
import SectionHeading from './SectionHeading';

/** ⑤ 发展历程：单轨时间轴（明亮版） */
export default function Timeline() {
  return (
    <section id="timeline" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                eyebrow="Milestones"
                title="发展历程"
                desc="2017 年成立至今，不断实现自我突破和快速成长。"
              />
            </div>
          </div>

          <ol className="relative lg:col-span-8">
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-neutral-200" />
            {timeline.map((item) => (
              <li key={item.year} className="group relative pb-10 pl-10 last:pb-0">
                <span className="absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-neutral-300 bg-white transition group-hover:border-brand-500">
                  <span className="h-[5px] w-[5px] rounded-full bg-brand-500" />
                </span>
                <div className="tnum text-xl font-extrabold tracking-tight text-neutral-900">
                  {item.year}
                </div>
                <div className="mt-1 font-semibold text-neutral-800">
                  {item.title}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
                  {item.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
