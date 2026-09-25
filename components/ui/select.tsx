import * as React from "react";

import { cn } from "@/lib/utils";

/** Native <select> styled to match the Input component. */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full appearance-none rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors",
      "placeholder:text-text-muted",
      "hover:border-text-muted/70",
      "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "aria-[invalid=true]:border-status-destructive aria-[invalid=true]:focus:ring-status-destructive/30",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
