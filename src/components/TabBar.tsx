import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Icon, { type IconName } from './Icon';
import { company } from '../data/company';

/**
 * 移动端底部 TabBar（明亮版，lg 以下显示，仅官网首页使用）
 * 首页 / 业务 / 荣誉 / 电话
 */
const tabs: {
  key: string;
  label: string;
  icon: IconName;
  href?: string;
  tel?: boolean;
  spy?: string;
}[] = [
  { key: 'home', label: '首页', icon: 'home', href: '/#hero', spy: 'hero' },
  { key: 'solutions', label: '业务', icon: 'briefcase', href: '/#solutions', spy: 'solutions' },
  { key: 'honors', label: '荣誉', icon: 'check', href: '/#honors', spy: 'honors' },
  { key: 'phone', label: '电话', icon: 'phone', tel: true },
];

export default function TabBar() {
  const [active, setActive] = useState('home');
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== '/') {
      setActive('');
      return;
    }
    const onScroll = () => {
      const offset = window.scrollY + 160;
      let current = 'hero';
      for (const t of tabs) {
        if (!t.spy) continue;
        const el = document.getElementById(t.spy);
        if (el && el.offsetTop <= offset) current = t.spy;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {tabs.map((t) => {
          const isActive = !!t.spy && active === t.spy;
          const cls = `flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
            isActive ? 'text-brand-600' : 'text-neutral-400'
          }`;
          const iconCls = `h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`;

          if (t.tel) {
            return (
              <a key={t.key} href={`tel:${company.hotline}`} className={cls}>
                <Icon name={t.icon} className={`${iconCls} text-neutral-900`} />
                <span>{t.label}</span>
              </a>
            );
          }
          return (
            <a key={t.key} href={t.href} className={cls}>
              <Icon name={t.icon} className={iconCls} />
              <span>{t.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
