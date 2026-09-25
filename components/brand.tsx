import { HeartPulse } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = {
    sm: "h-8 w-8 rounded-control",
    md: "h-10 w-10 rounded-card",
    lg: "h-12 w-12 rounded-card",
  }[size];
  const icon = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center bg-primary text-white",
        box,
        className,
      )}
    >
      <HeartPulse className={icon} aria-hidden="true" />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-sans text-xl font-semibold tracking-tight text-secondary",
        className,
      )}
    >
      <Logo />
      MedBook AI
    </span>
  );
}
