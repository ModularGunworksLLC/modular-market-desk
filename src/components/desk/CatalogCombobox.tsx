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
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-desk-border bg-desk-panel shadow-lg"
        >
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === value}
                className={`flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-desk-accent/15 ${
                  item.id === value ? "bg-desk-accent/10 text-desk-text" : "text-desk-text"
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.id);
                  setQuery(item.name);
                  setOpen(false);
                }}
              >
                <span>{item.name}</span>
                {item.hint && <span className="ml-2 text-[10px] text-desk-muted">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !disabled && query.trim() && filtered.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-md border border-desk-border bg-desk-panel px-3 py-2 text-xs text-desk-muted">
          No matches
        </p>
      )}
    </div>
  );
}
