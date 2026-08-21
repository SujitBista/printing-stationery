"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SearchableSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  size?: "default" | "sm";
  clearable?: boolean;
  maxVisibleOptions?: number;
  "aria-label"?: string;
  "aria-busy"?: boolean;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function getPortalRoot(node: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined" || !node) {
    return null;
  }
  return node.closest("dialog") ?? document.body;
}

function computePanelStyle(trigger: HTMLElement): CSSProperties {
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const preferredHeight = 288;
  const spaceBelow = window.innerHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
  const available = openUpward ? spaceAbove : spaceBelow;
  const height = Math.min(preferredHeight, Math.max(180, available));

  return {
    position: "fixed",
    left: Math.max(8, rect.left),
    width: Math.max(rect.width, 240),
    zIndex: 2147483646,
    maxHeight: height,
    ...(openUpward
      ? { bottom: window.innerHeight - rect.top + gap, top: "auto" }
      : { top: rect.bottom + gap, bottom: "auto" }),
  };
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyMessage = "No matches",
  disabled = false,
  required = false,
  id,
  name,
  className = "",
  size = "default",
  clearable = true,
  maxVisibleOptions = 100,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
}: SearchableSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query);
    if (!needle) {
      return options;
    }
    return options.filter((option) => normalize(option.label).includes(needle));
  }, [options, query]);

  const visible = filtered.slice(0, maxVisibleOptions);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  function openPanel() {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    setPortalRoot(getPortalRoot(trigger));
    setPanelStyle(computePanelStyle(trigger));
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
    setPortalRoot(null);
    setPanelStyle(null);
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }
      setPanelStyle(computePanelStyle(trigger));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setHighlightIndex(0);
    const handle = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      closePanel();
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closePanel();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectOption(option: SearchableSelectOption) {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    closePanel();
  }

  function clearSelection() {
    onChange("");
    closePanel();
  }

  function moveHighlight(delta: number) {
    if (visible.length === 0) {
      return;
    }
    setHighlightIndex((current) => {
      let next = current;
      for (let attempt = 0; attempt < visible.length; attempt += 1) {
        next = (next + delta + visible.length) % visible.length;
        if (!visible[next]?.disabled) {
          return next;
        }
      }
      return current;
    });
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPanel();
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[highlightIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
    }
  }

  const triggerClass =
    size === "sm"
      ? "min-h-8 rounded-md border border-border bg-paper px-2 py-1 text-xs"
      : "min-h-10 rounded-lg border border-border bg-paper-elevated px-3 py-2 text-sm";

  const panel =
    open && portalRoot && panelStyle
      ? createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-paper-elevated shadow-xl shadow-accent/15"
          >
            <div className="shrink-0 border-b border-border bg-accent-soft p-2">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-accent-tint bg-paper-elevated px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <ul
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel ?? placeholder}
              className="min-h-0 flex-1 overflow-y-auto py-1"
            >
              {visible.length === 0 ? (
                <li className="px-3 py-2 text-sm text-ink-muted">{emptyMessage}</li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightIndex;
                  return (
                    <li key={option.value} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={option.disabled}
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => selectOption(option)}
                        className={`flex w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          isHighlighted
                            ? "bg-accent-soft text-accent"
                            : "text-ink"
                        } ${isSelected ? "font-semibold" : ""}`}
                      >
                        <span className="truncate">{option.label}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {hiddenCount > 0 ? (
              <p className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-ink-muted">
                {hiddenCount} more — keep typing to narrow results
              </p>
            ) : null}
          </div>,
          portalRoot,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        aria-busy={ariaBusy || undefined}
        aria-required={required || undefined}
        onClick={() => {
          if (disabled) {
            return;
          }
          if (open) {
            closePanel();
            return;
          }
          openPanel();
        }}
        onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 text-left outline-none transition focus:border-accent-mid focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 ${triggerClass}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selected ? "text-ink" : "text-ink-muted"
          }`}
        >
          {selected?.label ?? placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-ink-subtle">
          {clearable && value && !disabled ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              className="rounded px-1 hover:bg-paper hover:text-ink"
              onClick={(event) => {
                event.stopPropagation();
                clearSelection();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  clearSelection();
                }
              }}
            >
              ×
            </span>
          ) : null}
          <span aria-hidden="true" className="text-xs font-medium text-accent">
            Search
          </span>
        </span>
      </button>
      {panel}
    </div>
  );
}
