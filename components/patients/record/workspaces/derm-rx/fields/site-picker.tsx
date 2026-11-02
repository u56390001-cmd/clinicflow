"use client";

/**
 * Site field — lesion pin / body-site presets (from the body map) plus a
 * free-text site. Multi-select via checkboxes; empty = no linked site.
 */

import { useState } from "react";
import { Check, ChevronDown, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function siteLabel(sites?: string[]): string {
  const list = (sites ?? []).filter(Boolean);
  if (list.length === 0) return "Site";
  return list.join(" + ");
}

export function SitePicker({
  value,
  onChange,
  options,
  disabled,
}: {
  value?: string[];
  onChange: (sites: string[] | undefined) => void;
  /** Body-map lesion labels, e.g. "Pin #1 - Face". */
  options?: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const current = value ?? [];

  const toggle = (site: string) => {
    if (current.includes(site)) {
      const next = current.filter((s) => s !== site);
      onChange(next.length > 0 ? next : undefined);
      return;
    }
    onChange([...current, site]);
  };

  const addCustom = () => {
    const site = custom.trim();
    if (!site) return;
    if (!current.includes(site)) onChange([...current, site]);
    setCustom("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="border-hairline bg-surface text-text-muted hover:text-text-primary"
          aria-haspopup="listbox"
        >
          <MapPin className="h-4 w-4 shrink-0 text-status-info/40" />
          <span className="max-w-44 truncate text-sm">{siteLabel(value)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 bg-surface">
        {options && options.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-text-muted">Lesion pins</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {options.map((site) => (
                <button
                  key={site}
                  type="button"
                  aria-pressed={current.includes(site)}
                  onClick={() => toggle(site)}
                  className={
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-app " +
                    (current.includes(site)
                      ? " bg-app text-text-primary"
                      : " text-text-muted")
                  }
                >
                  {current.includes(site) ? (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  ) : null}
                  <span className="truncate">{site}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-hairline pt-2">
          <p className="text-xs font-medium text-text-muted">Custom site</p>
          <div className="flex items-center gap-2">
            <Input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="e.g. Back of the hand"
              aria-label="Custom site name"
              className="h-8 border-input text-xs"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCustom();
                  setOpen(false);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 px-2 text-xs"
              onClick={() => {
                addCustom();
                setOpen(false);
              }}
            >
              Add
            </Button>
          </div>
          {current.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {current.map((site) => (
                <button
                  key={site}
                  type="button"
                  onClick={() => toggle(site)}
                  className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary"
                >
                  <X className="h-3 w-3" />
                  {site}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
