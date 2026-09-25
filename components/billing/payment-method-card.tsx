"use client";

import { useState } from "react";
import { Copy, Check, Landmark, Smartphone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types/database";

interface PaymentMethodCardProps {
  method: PaymentMethod;
  selected?: boolean;
  onSelect?: () => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  bank_transfer: Landmark,
  jazzcash: Smartphone,
  easypaisa: Smartphone,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-text-muted" />
      )}
    </Button>
  );
}

export function PaymentMethodCard({
  method,
  selected,
  onSelect,
}: PaymentMethodCardProps) {
  const Icon = TYPE_ICONS[method.type] ?? Landmark;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        selected && "border-primary ring-2 ring-primary/20",
      )}
      onClick={onSelect}
    >
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <CardTitle className="text-base">{method.name}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {method.account_title && (
          <p className="text-sm text-text-secondary">{method.account_title}</p>
        )}

        {method.account_number && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary">{method.account_number}</span>
            <CopyButton text={method.account_number} />
          </div>
        )}

        {method.iban && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary break-all">{method.iban}</span>
            <CopyButton text={method.iban} />
          </div>
        )}

        {method.instructions && (
          <p className="text-xs text-text-muted">{method.instructions}</p>
        )}
      </CardContent>
    </Card>
  );
}
