import type { ReactNode } from 'react';

export default function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className={`mt-10 w-full rounded-xl bg-white p-6 shadow-xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
