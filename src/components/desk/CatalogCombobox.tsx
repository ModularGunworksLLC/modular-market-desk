"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

type Item = { id: number; name: string; hint?: string };

type Props = {
  label: string;
  items: Item[];
  value: number | "";
  onChange: (id: number | "") => void;
  placeholder: string;
  disabled?: boolean;
};

/** Type-to-filter combobox for long OA catalog lists (Make / Model). */
export function CatalogCombobox({ label, items, value, onChange, placeholder, disabled }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => (typeof value === "number" ? items.find((i) => i.id === value) : undefined),
    [items, value],
  );

  useEffect(() => {
    if (selected) setQuery(selected.name);
    else if (value === "") setQuery("");
  }, [selected, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && q === selected.name.toLowerCase())) return items.slice(0, 80);
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 80);
  }, [items, query, selected]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (selected && e.target.value !== selected.name) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && filtered.length === 1) {
            e.preventDefault();
            onChange(filtered[0]!.id);
            setQuery(filtered[0]!.name);
            setOpen(false);
          }
        }}
      />
      {open && !disabled && filtered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="desk-scroll absolute z-30 mt-1 max-h-64 min-w-full w-max max-w-[min(100vw-2rem,22rem)] overflow-y-auto overflow-x-hidden rounded-md border border-desk-border bg-desk-panel2 py-1 shadow-xl"
        >
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === value}
                title={item.hint ? `${item.name} — ${item.hint}` : item.name}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm leading-snug hover:bg-desk-accent/20 ${
                  item.id === value ? "bg-desk-accent/15 text-desk-text" : "text-desk-text"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.id);
                  setQuery(item.name);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate normal-case tracking-normal">{item.name}</span>
                {item.hint && (
                  <span className="shrink-0 text-[10px] tabular-nums text-desk-muted">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && query.trim() && filtered.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-md border border-desk-border bg-desk-panel2 px-3 py-2.5 text-xs text-desk-muted shadow-xl">
          No matches
        </p>
      )}
    </div>
  );
}
