import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types/database";

interface PlanCardProps {
  plan: SubscriptionPlan;
  selected?: boolean;
  onSelect?: () => void;
  current?: boolean;
}

export function PlanCard({ plan, selected, onSelect, current }: PlanCardProps) {
  return (
    <Card
      className={cn(
        "relative cursor-pointer transition-all",
        selected && "border-primary ring-2 ring-primary/20",
        current && "border-primary/50",
      )}
      onClick={onSelect}
    >
      {current && (
        <div className="absolute -top-3 left-4">
          <Badge className="bg-primary/10 text-primary">Current Plan</Badge>
        </div>
      )}

      <CardHeader className="text-center">
        <CardTitle>{plan.name}</CardTitle>
        <div className="mt-2">
          <span className="text-3xl font-bold text-text-primary">
            {plan.currency} {plan.price.toLocaleString()}
          </span>
          <span className="text-sm text-text-secondary">/{plan.billing_interval}</span>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-2.5">
          {plan.features.map((feature) => (
            <li key={feature.key} className="flex items-start gap-2 text-sm">
              {feature.included ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
              )}
              <span
                className={cn(
                  feature.included ? "text-text-primary" : "text-text-muted",
                )}
              >
                {feature.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter>
        {current ? (
          <Button variant="outline" className="w-full" disabled>
            Current Plan
          </Button>
        ) : (
          <Button
            variant={selected ? "primary" : "outline"}
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
          >
            Select Plan
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
