import { Link } from 'react-router-dom';
import { company, navSections } from '../data/company';
import Icon from './Icon';

/** 页脚：深色现代风（品牌 + 导航 + 联系方式） */
export default function Footer() {
  return (
    <footer className="border-t border-neutral-800/80 bg-neutral-950 py-14 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="grid gap-12 md:grid-cols-3">
          {/* 品牌 */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white">
                聚
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                {company.brandText}
              </span>
            </div>
            <p className="mt-5 text-sm leading-relaxed">
              {company.fullName}
              <br />
              {company.slogan}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['劳务派遣', '生产线外包', '人事托管', '产业园运营', 'OPC社区', 'OEM工厂'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-neutral-800 px-3 py-1 text-[11px] text-neutral-500"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>

          {/* 快捷导航 */}
          <div>
            <h4 className="text-sm font-semibold tracking-wider text-white">
              快捷导航
            </h4>
            <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {navSections.map((s) => (
                <li key={s.id}>
                  <Link to={`/#${s.id}`} className="transition hover:text-white">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 联系方式 */}
          <div>
            <h4 className="text-sm font-semibold tracking-wider text-white">
              联系我们
            </h4>
            <ul className="mt-5 space-y-3.5 text-sm">
              <li className="flex items-start gap-2.5">
                <Icon name="phone" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                <a href={`tel:${company.hotline}`} className="tnum transition hover:text-white">
                  {company.hotline}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                <span className="leading-relaxed">{company.address}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                <span>周一至周日 8:30 - 18:00</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-neutral-800 pt-7 text-xs md:flex-row">
          <p>
            © 2017-{new Date().getFullYear()} {company.fullName}
          </p>
          <p className="text-neutral-600">
            让每一家企业用工无忧，为三亿国人找到理想的工作
          </p>
        </div>
      </div>
    </footer>
  );
}
