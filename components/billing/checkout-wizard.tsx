import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Summary", number: 1 },
  { label: "Payment", number: 2 },
  { label: "Upload", number: 3 },
] as const;

interface CheckoutWizardProps {
  currentStep: number;
  children: React.ReactNode;
}

export function CheckoutWizard({ currentStep, children }: CheckoutWizardProps) {
  return (
    <div className="space-y-8">
      <nav aria-label="Checkout steps">
        <ol className="flex items-center">
          {STEPS.map((step, index) => {
            const isCompleted = currentStep > step.number;
            const isCurrent = currentStep === step.number;

            return (
              <li
                key={step.number}
                className={cn("flex items-center", index < STEPS.length - 1 && "flex-1")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      isCompleted && "bg-primary text-white",
                      isCurrent && "border-2 border-primary text-primary",
                      !isCompleted && !isCurrent && "border-2 border-text-muted/30 text-text-muted",
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step.number
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isCurrent ? "text-primary" : "text-text-muted",
                    )}
                  >
                    {step.label}
                  </span>
                </div>

                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mx-3 h-px flex-1",
                      isCompleted ? "bg-primary" : "bg-text-muted/20",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {children}
    </div>
  );
}
