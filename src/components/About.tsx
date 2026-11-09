import { company, culture } from '../data/company';
import SectionHeading from './SectionHeading';
import Icon from './Icon';
import type { IconName } from './Icon';

/** ③ 关于我们：明亮 Bento 网格 + 企业文化重点展示带 */
const cultureIcons: IconName[] = ['eye', 'target', 'heart', 'flag'];

export default function About() {
  return (
    <section id="about" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <SectionHeading
          eyebrow="About Us"
          title="八年深耕，连接人才与机会"
          desc="用专业与规模，成为企业信赖的人力资源服务伙伴。"
        />

        <div className="grid gap-4 lg:grid-cols-12">
          {/* 大图 */}
          <figure className="group relative overflow-hidden rounded-[1.75rem] border border-neutral-200 lg:col-span-7">
            <img
              src="/images/about-hero.jpg"
              alt="中聚人力现代化总部办公场景"
              className="h-72 w-full object-cover transition duration-700 group-hover:scale-105 md:h-[420px]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/50 via-transparent to-transparent" />
            <figcaption className="absolute bottom-4 left-4 rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold text-neutral-900">
              公司总部 · 山东德州
            </figcaption>
          </figure>

          {/* 公司介绍卡 */}
          <div className="flex flex-col rounded-[1.75rem] border border-neutral-200 bg-white p-7 shadow-card lg:col-span-5 lg:p-9">
            <h3 className="text-lg font-bold tracking-tight text-neutral-900">
              {company.fullName}
            </h3>
            <p className="mt-4 flex-1 text-sm leading-[1.9] text-neutral-500 md:text-[15px]">
              {company.intro}
            </p>
            <ul className="mt-6 space-y-3 border-t border-neutral-100 pt-5 text-sm text-neutral-600">
              <li className="flex items-start gap-2.5">
                <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>总部：{company.address}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="market" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                <span>零工市场：{company.gigMarket}</span>
              </li>
            </ul>
          </div>

          {/* 企业文化（对外宣传重点，独立展示带） */}
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500/10 via-white to-butter/25 p-6 md:p-10 lg:col-span-12">
            <div className="glow-blob -left-16 -top-16 h-48 w-48 bg-brand-500/10" />
            <div className="glow-blob -bottom-16 -right-10 h-48 w-48 bg-butter/25" />
            <SectionHeading
              eyebrow="Our Culture"
              title="企业文化"
              desc="动机至善、私心了无——文化是中聚人共同的信念与行动准则。"
            />
            <div className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {culture.map((c, i) => (
                <div
                  key={c.title}
                  className="group rounded-3xl border border-neutral-200/80 bg-white p-7 shadow-card transition duration-300 hover:-translate-y-1.5 hover:shadow-card-hover"
                >
                  <div className="flex items-start justify-between">
                    <div className="rounded-2xl bg-brand-500/10 p-3 transition duration-300 group-hover:bg-brand-500">
                      <Icon
                        name={cultureIcons[i % cultureIcons.length]}
                        className="h-6 w-6 text-brand-500 transition duration-300 group-hover:text-white"
                      />
                    </div>
                    <span className="tnum select-none text-4xl font-extrabold leading-none text-neutral-100 transition duration-300 group-hover:text-brand-500/20">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-neutral-900">
                    {c.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-neutral-500">
                    {c.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
