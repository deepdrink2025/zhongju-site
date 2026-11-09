import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { company, navSections } from '../data/company';
import Icon from './Icon';

/**
 * 顶部固定导航栏（明亮版：白底细边框、胶囊 CTA）
 */
export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState('hero');
  const { pathname } = useLocation();

  const isCardPage = pathname.startsWith('/card');

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      if (isCardPage) return;
      const offset = window.scrollY + 120;
      let current = navSections[0].id;
      for (const s of navSections) {
        const el = document.getElementById(s.id);
        if (el && el.offsetTop <= offset) {
          current = s.id;
        }
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isCardPage]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all ${
        scrolled || menuOpen
          ? 'border-b border-neutral-200/80 bg-white/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-white/60 backdrop-blur-sm'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-[72px] lg:px-8">
        {/* LOGO */}
        <Link to="/" className="flex items-center gap-2.5" onClick={closeMenu}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-base font-bold text-white">
            聚
          </span>
          <span className="text-lg font-bold tracking-tight text-neutral-900">
            {company.brandText}
          </span>
        </Link>

        {/* PC 导航 */}
        {isCardPage ? (
          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 md:flex"
          >
            <Icon name="back" className="h-4 w-4" />
            返回官网
          </Link>
        ) : (
          <nav className="hidden items-center gap-7 lg:flex">
            {navSections.map((s) => (
              <a
                key={s.id}
                href={`/#${s.id}`}
                onClick={() => setActiveId(s.id)}
                className={`text-sm font-medium transition-colors ${
                  activeId === s.id
                    ? 'text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}

        {/* PC 右侧 CTA */}
        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={`tel:${company.hotline}`}
            className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700"
          >
            <Icon name="phone" className="h-4 w-4" />
            {company.hotline}
          </a>
        </div>

        {/* 移动端汉堡按钮 */}
        <button
          type="button"
          aria-label="打开菜单"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} className="h-6 w-6" />
        </button>
      </div>

      {/* 移动端抽屉菜单 */}
      {menuOpen && (
        <nav className="border-t border-neutral-100 bg-white px-4 pb-4 pt-2 lg:hidden">
          {isCardPage ? (
            <Link
              to="/"
              onClick={closeMenu}
              className="block rounded-lg px-3 py-3 text-base font-medium text-neutral-900 hover:bg-neutral-50"
            >
              ← 返回官网
            </Link>
          ) : (
            navSections.map((s) => (
              <a
                key={s.id}
                href={`/#${s.id}`}
                onClick={closeMenu}
                className={`block rounded-lg px-3 py-3 text-base font-medium ${
                  activeId === s.id
                    ? 'bg-neutral-50 text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {s.label}
              </a>
            ))
          )}
          <a
            href={`tel:${company.hotline}`}
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-base font-semibold text-white"
          >
            <Icon name="phone" className="h-4 w-4" />
            服务热线 {company.hotline}
          </a>
        </nav>
      )}
    </header>
  );
}
