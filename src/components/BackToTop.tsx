import { useEffect, useState } from 'react';
import Icon from './Icon';

/** 返回顶部按钮（滚动超过一屏后出现） */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="返回顶部"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-20 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-card-hover transition hover:-translate-y-1 lg:bottom-8 lg:right-8"
    >
      <Icon name="arrowUp" className="h-6 w-6" />
    </button>
  );
}
