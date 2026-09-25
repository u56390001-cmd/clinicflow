import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "default" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  default: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[3px]",
};

function Spinner({ className, size = "default", ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block animate-spin rounded-pill border-current border-t-transparent",
        sizeMap[size],
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
