import { company } from '../data/company';
import SectionHeading from './SectionHeading';
import Icon from './Icon';

/** ⑩ 联系我们（明亮版）：品牌橙渐变描边卡 + 白色内区 */
export default function Contact() {
  return (
    <section id="contact" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-brand-gradient p-1 shadow-glow-brand">
          {/* 光晕装饰 */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/30 blur-[80px]" />

          <div className="grid gap-12 rounded-[2.4rem] bg-white p-8 md:p-14 lg:grid-cols-2 lg:p-16">
            {/* 左侧：CTA */}
            <div className="flex flex-col justify-center">
              <SectionHeading
                eyebrow="Contact"
                title="让我们一起，让用工更简单"
                desc="拨打服务热线或联系业务顾问，24 小时内获取定制用工方案。"
              />
              <a
                href={`tel:${company.hotline}`}
                className="tnum flex items-center gap-3 text-3xl font-extrabold tracking-tight text-neutral-900 md:text-4xl"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white">
                  <Icon name="phone" className="h-6 w-6" />
                </span>
                {company.hotline}
              </a>
              <ul className="mt-8 space-y-3.5 text-sm text-neutral-600 md:text-base">
                <li className="flex items-start gap-3">
                  <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>公司地址：{company.address}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Icon name="location" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>零工市场：{company.gigMarket}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <span>服务时间：周一至周日 8:30 - 18:00</span>
                </li>
              </ul>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href={`tel:${company.hotline}`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-neutral-700"
                >
                  立即拨打热线
                </a>
                <a
                  href={`https://ditu.amap.com/search?query=${encodeURIComponent(
                    '山东中聚人力资源服务有限公司'
                  )}&city=${encodeURIComponent('德州')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-7 py-3.5 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900"
                >
                  <Icon name="location" className="h-4 w-4" />
                  高德地图导航
                </a>
              </div>
            </div>

            {/* 右侧：官方二维码卡 */}
            <div className="flex flex-col justify-center">
              <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-8">
                <div className="mx-auto grid max-w-md grid-cols-2 gap-6">
                  <div className="flex flex-col items-center">
                    <div className="w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-card">
                      <img
                        src="/images/qr-gongzhonghao_std.png"
                        alt="公司官方公众号二维码"
                        className="aspect-square w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-neutral-800">
                      公司官方公众号
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-card">
                      <img
                        src="/images/qr-qilu_std.png"
                        alt="齐鲁招聘小程序二维码"
                        className="aspect-square w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-neutral-800">
                      齐鲁招聘小程序
                    </p>
                  </div>
                </div>
                <p className="mt-6 border-t border-neutral-200 pt-5 text-center text-xs leading-relaxed text-neutral-500">
                  关注公众号获取最新岗位信息
                  <br />
                  或扫码使用"齐鲁招聘"小程序
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
