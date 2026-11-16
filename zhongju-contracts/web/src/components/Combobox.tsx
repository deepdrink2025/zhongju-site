import { useEffect, useRef, useState } from 'react';

export interface ComboOption {
  label: string;
  value: string;
}

export default function Combobox({
  value,
  options,
  onChange,
  placeholder,
  wrapperClassName = 'w-full',
  inputClassName = 'input pr-7',
  editable = true,
}: {
  value: string;
  options: ComboOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  wrapperClassName?: string;
  inputClassName?: string;
  editable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className={`relative ${wrapperClassName}`} ref={ref}>
      <input
        className={`${inputClassName} ${editable ? '' : 'cursor-pointer'}`}
        placeholder={placeholder}
        value={value}
        readOnly={!editable}
        onChange={(e) => editable && onChange(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      <button
        type="button"
        aria-label="展开选项"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
        onClick={() => setOpen(!open)}
      >
        ▼
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-50 ${o.value === value ? 'text-brand-700 font-medium' : 'text-slate-700'}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
