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
  filterable = false,
  emptyHint,
}: {
  value: string;
  options: ComboOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  wrapperClassName?: string;
  inputClassName?: string;
  editable?: boolean;
  /** 输入时对选项做模糊过滤（仅可输入模式生效） */
  filterable?: boolean;
  /** 过滤后无匹配时显示的提示文字 */
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const kw = value.trim().toLowerCase();
  const visible =
    editable && filterable && kw
      ? options.filter((o) => o.label.toLowerCase().includes(kw))
      : options;

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
          {visible.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-ct-50 ${o.value === value ? 'text-ct-700 font-medium' : 'text-slate-700'}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
          {visible.length === 0 && emptyHint && (
            <div className="px-3 py-1.5 text-xs text-slate-400">{emptyHint}</div>
          )}
        </div>
      )}
    </div>
  );
}
