import Link from "next/link";
import {
  CalendarPlus,
  BarChart3,
  Star,
  MessageCircle,
  ArrowRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

type QuickAction = {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
};

export async function DashboardQuickActions({
  clinicId,
  googleReviewUrl,
}: {
  clinicId: string;
  googleReviewUrl: string | null;
}) {
  const supabase = await createClient();

  let whatsappConnected = false;
  try {
    const { data } = await supabase
      .from("clinic_whatsapp_config")
      .select("connection_status")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    whatsappConnected = data?.connection_status === "connected";
  } catch {
    whatsappConnected = false;
  }

  const actions: QuickAction[] = [
    {
      label: "Schedule New Appointment",
      href: APP_ROUTES.app.appointments,
      icon: <CalendarPlus aria-hidden="true" className="h-5 w-5" />,
    },
    {
      label: "View Reports",
      href: APP_ROUTES.app.dashboard,
      icon: <BarChart3 aria-hidden="true" className="h-5 w-5" />,
    },
  ];

  if (googleReviewUrl) {
    actions.push({
      label: "Manage Reviews",
      href: APP_ROUTES.app.settings,
      icon: <Star aria-hidden="true" className="h-5 w-5" />,
    });
  }

  if (whatsappConnected) {
    actions.push({
      label: "WhatsApp Connected",
      href: APP_ROUTES.app.aiSettings,
      icon: <MessageCircle aria-hidden="true" className="h-5 w-5 text-emerald-600" />,
      badge: (
        <Badge variant="success" className="ml-auto">
          Active
        </Badge>
      ),
    });
  } else {
    actions.push({
      label: "Complete WhatsApp Setup",
      href: APP_ROUTES.app.aiSettings,
      icon: <MessageCircle aria-hidden="true" className="h-5 w-5" />,
      badge: (
        <Badge variant="destructive" className="ml-auto">
          Required
        </Badge>
      ),
    });
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
        <div className="mt-2 divide-y divide-border-light">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 rounded-lg py-3 text-text-primary transition-colors hover:bg-background first:pt-0 last:pb-0"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {action.icon}
              </div>
              <span className="flex-1 text-sm font-medium">{action.label}</span>
              {action.badge}
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-text-muted"
              />
            </Link>
          ))}
        </div>
      </CardHeader>
    </Card>
  );
}
