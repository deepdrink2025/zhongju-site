/**
 * 现代区块标题（Butter 风）：彩色 chip 眉标 + 超大居中标题 + 副文案
 * accent: chip 颜色轮换
 */
const accents: Record<string, string> = {
  brand: 'bg-brand-500',
  butter: 'bg-butter',
  lime: 'bg-lime',
  violet: 'bg-violet',
  pink: 'bg-pink',
  sky: 'bg-sky',
};

const accentKeys = Object.keys(accents);

export default function SectionHeading({
  eyebrow,
  title,
  desc,
  accent,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  /** 不传则按内容自动轮换颜色 */
  accent?: keyof typeof accents | string;
}) {
  const key = accent && accents[accent] ? accent : accentKeys[eyebrow.length % accentKeys.length];
  return (
    <div className="mb-14 flex flex-col items-center text-center md:mb-20">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-neutral-950 ${accents[key]}`}
      >
        {eyebrow}
      </span>
      <h2 className="mt-6 max-w-3xl text-3xl font-extrabold leading-[1.12] tracking-tight text-neutral-900 md:text-5xl">
        {title}
      </h2>
      {desc && (
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-500 md:text-lg">
          {desc}
        </p>
      )}
    </div>
  );
}
