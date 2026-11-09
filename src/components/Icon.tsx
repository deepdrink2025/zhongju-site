/** 常用内联 SVG 图标集（按 name 取用，避免引入图标库） */
import type { CSSProperties } from 'react';

export type IconName =
  | 'users'
  | 'factory'
  | 'search'
  | 'shield'
  | 'market'
  | 'platform'
  | 'phone'
  | 'wechat'
  | 'share'
  | 'copy'
  | 'check'
  | 'close'
  | 'menu'
  | 'arrowUp'
  | 'location'
  | 'clock'
  | 'back'
  | 'home'
  | 'card'
  | 'briefcase'
  | 'idcard'
  | 'building'
  | 'cog'
  | 'eye'
  | 'target'
  | 'heart'
  | 'flag';

interface IconProps {
  name: IconName;
  className?: string;
  style?: CSSProperties;
}

const paths: Record<IconName, JSX.Element> = {
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </>
  ),
  factory: (
    <>
      <path d="M2 20h20" />
      <path d="M4 20V8l6 4V8l6 4V4h4v16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  shield: <path d="M12 2 4 5v6c0 5.25 3.4 9.74 8 11 4.6-1.26 8-5.75 8-11V5l-8-3z" />,
  market: (
    <>
      <path d="M3 9 4.5 3h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v10h14V11" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  platform: (
    <>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 18v3" />
      <path d="m8.5 11 2 2 4-4" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.2a2 2 0 0 1 2.11-.45c.91.32 1.85.55 2.81.68A2 2 0 0 1 22 16.92z" />
  ),
  wechat: (
    <>
      <path d="M8.5 3C4.91 3 2 5.46 2 8.5c0 1.73.95 3.27 2.43 4.28L3.8 15l2.44-1.22c.53.15 1.09.24 1.67.27" />
      <path d="M22 14.5c0-2.49-2.46-4.5-5.5-4.5S11 12.01 11 14.5s2.46 4.5 5.5 4.5c.62 0 1.21-.08 1.77-.24L20.5 20l-.55-1.94A4.28 4.28 0 0 0 22 14.5z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  arrowUp: (
    <>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  back: (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  home: (
    <>
      <path d="m3 10.5 9-7.5 9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M5.5 16c.5-1.5 1.5-2 2.5-2s2 .5 2.5 2" />
      <path d="M14 9h5" />
      <path d="M14 13h5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M2 12h20" />
    </>
  ),
  idcard: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <circle cx="8.5" cy="10.5" r="2.5" />
      <path d="M4.5 17c.8-2.2 2.3-3 4-3s3.2.8 4 3" />
      <path d="M15.5 9h4" />
      <path d="M15.5 13h4" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h3a1 1 0 0 1 1 1v11" />
      <path d="M2 21h20" />
      <path d="M8 7h2" />
      <path d="M8 11h2" />
      <path d="M8 15h2" />
      <path d="M12 21v-4h2v4" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="m4.6 4.6 2.1 2.1" />
      <path d="m17.3 17.3 2.1 2.1" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="m4.6 19.4 2.1-2.1" />
      <path d="m17.3 6.7 2.1-2.1" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  heart: (
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  ),
  flag: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
};

export default function Icon({ name, className = 'w-5 h-5', style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
