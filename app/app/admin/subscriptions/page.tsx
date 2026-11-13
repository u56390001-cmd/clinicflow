import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils/currency";
import type { SubscriptionStatus } from "@/types/database";

export const metadata: Metadata = { title: "Subscriptions" };

type PlanSummary = {
  code: string;
  name: string;
  price: number;
  currency: string;
  limits: { doctor_seats?: number | null; team_seats?: number | null };
};

type SubscriptionRow = {
  clinic_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
  plan: PlanSummary | PlanSummary[] | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring: "bg-amber-50 text-amber-700",
  pending_payment: "bg-sky-50 text-sky-700",
  payment_submitted: "bg-sky-50 text-sky-700",
  under_review: "bg-sky-50 text-sky-700",
  approved: "bg-emerald-50 text-emerald-700",
  expired: "bg-rose-50 text-rose-700",
  rejected: "bg-rose-50 text-rose-700",
};

function planOf(row: SubscriptionRow): PlanSummary | null {
  if (Array.isArray(row.plan)) return row.plan[0] ?? null;
  return row.plan;
}

function isGranting(row: SubscriptionRow): boolean {
  if (row.status !== "active") return false;
  if (!row.current_period_end) return true;
  return new Date(row.current_period_end).getTime() > Date.now();
}

function seatLabel(value: number | null | undefined): string {
  return value === null ? "Unlimited" : String(value ?? 0);
}

async function isPlatformAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!data;
}

export default async function AdminSubscriptionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(APP_ROUTES.auth.login);

  if (!(await isPlatformAdmin(supabase))) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Subscriptions
          </h1>
        </div>
        <div className="rounded-card border border-text-muted/30 bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">
            Access denied. You don&apos;t have Super Admin privileges.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: clinics }, { data: subscriptions }, { data: doctorRows }, { data: memberRows }] =
    await Promise.all([
      supabase
        .from("clinics")
        .select("id, name, slug, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select(
          "clinic_id, status, current_period_end, created_at, plan:subscription_plans(code, name, price, currency, limits)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("doctors").select("clinic_id"),
      supabase.from("clinic_members").select("clinic_id"),
    ]);

  const clinicById = new Map((clinics ?? []).map((clinic) => [clinic.id, clinic]));
  const latestByClinic = new Map<string, SubscriptionRow>();

  for (const row of (subscriptions ?? []) as unknown as SubscriptionRow[]) {
    if (!latestByClinic.has(row.clinic_id)) latestByClinic.set(row.clinic_id, row);
  }

  const doctorCounts = new Map<string, number>();
  for (const row of doctorRows ?? []) {
    doctorCounts.set(row.clinic_id, (doctorCounts.get(row.clinic_id) ?? 0) + 1);
  }

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    memberCounts.set(row.clinic_id, (memberCounts.get(row.clinic_id) ?? 0) + 1);
  }

  const activeCount = [...latestByClinic.values()].filter(isGranting).length;
  const pendingCount = [...latestByClinic.values()].filter((row) =>
    ["pending_payment", "payment_submitted", "under_review"].includes(row.status),
  ).length;
  const mrr = [...latestByClinic.values()].reduce((total, row) => {
    if (!isGranting(row)) return total;
    return total + Number(planOf(row)?.price ?? 0);
  }, 0);

  const planMix = new Map<string, { name: string; count: number }>();
  for (const row of latestByClinic.values()) {
    const plan = planOf(row);
    if (!plan) continue;
    const current = planMix.get(plan.code) ?? { name: plan.name, count: 0 };
    current.count += 1;
    planMix.set(plan.code, current);
  }

  const rows = [...latestByClinic.entries()]
    .map(([clinicId, row]) => ({
      clinic: clinicById.get(clinicId),
      row,
      plan: planOf(row),
    }))
    .filter((entry) => !!entry.clinic)
    .slice(0, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Subscriptions
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every clinic&apos;s plan, status and seat usage. Payment review and
          registration approvals live in their own screens.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clinics" value={String(clinics?.length ?? 0)} />
        <Stat label="Active subscriptions" value={String(activeCount)} />
        <Stat label="Monthly recurring revenue" value={formatCurrency(mrr, "PKR")} />
        <Stat label="Awaiting payment review" value={String(pendingCount)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {[...planMix.entries()].map(([code, plan]) => (
          <div
            key={code}
            className="rounded-card border border-text-muted/30 bg-surface p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {plan.name}
            </p>
            <p className="mt-1 text-2xl font-semibold text-secondary">
              {plan.count}
            </p>
            <p className="text-xs text-text-muted">clinics on this plan</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-text-muted/30 bg-surface">
        <div className="border-b border-text-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-secondary">
            Recent clinics
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-app text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Renews</th>
                <th className="px-4 py-3 font-medium">Doctors</th>
                <th className="px-4 py-3 font-medium">Team logins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-muted/15">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No clinics have a subscription yet.
                  </td>
                </tr>
              ) : (
                rows.map(({ clinic, row, plan }) => (
                  <tr key={row.clinic_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-secondary">{clinic!.name}</p>
                      <p className="text-xs text-text-muted">{clinic!.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {plan?.name ?? "No plan"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[row.status] ?? "bg-app text-text-muted"
                        }`}
                      >
                        {row.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.current_period_end
                        ? new Date(row.current_period_end).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {doctorCounts.get(row.clinic_id) ?? 0} /{" "}
                      {seatLabel(plan?.limits?.doctor_seats)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {memberCounts.get(row.clinic_id) ?? 0} /{" "}
                      {seatLabel(plan?.limits?.team_seats)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-text-muted/30 bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-secondary">{value}</p>
    </div>
  );
}
