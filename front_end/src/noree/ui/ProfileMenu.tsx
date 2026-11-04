import { useEffect, useId, useRef, useState } from "react";

export const initialOf = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

type Props = { name: string; color: string; onRename: (name: string) => void };

/** There are no accounts yet, so a profile is just a name and a color kept in this browser. */
export function ProfileMenu({ name, color, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Your profile"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-n-surface transition-transform hover:scale-105"
        style={{ backgroundColor: color }}
      >
        {initialOf(name)}
      </button>
      {open && (
        <div role="dialog" aria-label="Your profile" className="n-float n-rise absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl p-4">
          <label htmlFor={inputId} className="n-eyebrow block">
            Your display name
          </label>
          <input
            id={inputId}
            aria-label="Your display name"
            defaultValue={name}
            maxLength={40}
            autoFocus
            className="n-field mt-2"
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <p className="mt-2.5 text-xs leading-5 text-n-ink-3">Shown to others on a board. It's saved in this browser, because there are no accounts yet.</p>
        </div>
      )}
    </div>
  );
}
