"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface CollapsibleContextValue {
  open: boolean;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleContextValue>({
  open: false,
  toggle: () => {},
});

function Collapsible({
  defaultOpen = false,
  children,
  className,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <CollapsibleContext.Provider value={{ open, toggle }}>
      <div className={cn("space-y-1", className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, toggle } = useContext(CollapsibleContext);

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex w-full items-center gap-2 text-left text-sm font-semibold text-text-primary transition-colors hover:text-primary",
        className,
      )}
      aria-expanded={open}
    >
      {children}
      <ChevronDown
        className={cn(
          "ml-auto h-4 w-4 shrink-0 text-text-muted transition-transform duration-200",
          open && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

function CollapsibleContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open } = useContext(CollapsibleContext);

  if (!open) return null;

  return <div className={cn("space-y-2", className)}>{children}</div>;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
