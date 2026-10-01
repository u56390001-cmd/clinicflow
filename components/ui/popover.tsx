"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * Floating surface for the record's small anchored panels (a test chip's
 * sub-parameter checklist).
 *
 * Deliberately matches `DropdownMenu`'s surface rather than the registry's
 * default: this project has no `popover` colour token, so the registry classes
 * would fall back to transparent-on-nothing. It is also a clinical surface —
 * solid white, a slate-200 hairline, one soft shadow, no blur and no gradient.
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // z-[110], not the registry's z-50: the prescription workspace's
        // full-screen shell is `fixed inset-0 z-[100]`, and this popover opens
        // from a chip *inside* that shell. At z-50 it renders underneath the
        // shell's white surface — the gear appears dead. Clear the shell.
        "z-[110] w-72 rounded-panel border border-hairline bg-surface p-3 text-text-primary shadow-dropdown outline-none",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
