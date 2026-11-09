import { company } from '../data/company';
import Icon from './Icon';

/** ① Hero 首屏（明亮版）：白底点阵 + 淡彩光晕 + 渐变大标题 + 大图 */
export default function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden bg-white pt-16">
      {/* 点阵背景 + 淡彩光晕 */}
      <div className="dot-grid pointer-events-none absolute inset-0" />
      <div className="glow-blob -top-24 left-1/2 h-80 w-[42rem] -translate-x-1/2 bg-brand-500/15" />
      <div className="glow-blob right-[8%] top-40 h-56 w-56 bg-butter/30" />
      <div className="glow-blob left-[6%] top-56 h-56 w-56 bg-violet/15" />

      <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 text-center md:pt-24 lg:px-8">
        {/* 顶部 chips */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-butter px-4 py-1.5 text-xs font-bold text-neutral-900">
            EST. 2017
          </span>
          <span className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-medium text-neutral-600 shadow-sm">
            中国 · 山东
          </span>
        </div>

        {/* 超大标题 */}
        <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-900 md:text-6xl lg:text-7xl">
          让每一家企业
          <br />
          <span className="bg-gradient-to-r from-brand-500 via-brand-400 to-butter bg-clip-text text-transparent">
            用工无忧
          </span>
        </h1>

        <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-neutral-500 md:text-lg">
          {company.heroSubtitle}。劳务派遣、生产线外包、中小微企业人事托管、产业园运营、OPC社区运营、OEM工厂
          六大解决方案，
          <span className="tnum font-semibold text-neutral-900">年安置就业 100,000 人次</span>
          。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/#contact"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-8 py-4 text-base font-bold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-neutral-700 hover:shadow-card-hover"
          >
            免费获取用工方案
            <Icon name="arrowUp" className="h-4 w-4 rotate-45" />
          </a>
          <a
            href={`tel:${company.hotline}`}
            className="tnum inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-8 py-4 text-base font-semibold text-neutral-800 transition hover:border-neutral-900"
          >
            <Icon name="phone" className="h-4 w-4 text-brand-500" />
            {company.hotline}
          </a>
        </div>

        {/* 大图 */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          <div className="glow-blob inset-x-12 bottom-0 h-40 bg-brand-500/20" />
          <div className="relative overflow-hidden rounded-[2rem] border border-neutral-200 shadow-card-hover">
            <img
              src="/images/hero-city.jpg"
              alt="城市天际线与人才连接 · 中聚人力就业服务平台"
              className="h-64 w-full object-cover sm:h-80 lg:h-[440px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/50 via-transparent to-transparent" />
            {/* 图上浮动 chips */}
            <div className="absolute bottom-5 left-5 flex flex-wrap gap-2">
              <span className="tnum rounded-full bg-white px-4 py-1.5 text-xs font-bold text-neutral-900 shadow-card">
                47万+ 累计安置就业
              </span>
              <span className="rounded-full bg-neutral-950/70 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
                200+ 企业共同选择
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
