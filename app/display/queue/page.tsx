"use client";

import { redirect } from "next/navigation";
import Link from "next/link";
import { Tv, ExternalLink } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentClinic } from "@/lib/clinic-access";

export const dynamic = "force-dynamic";

export default async function QueueDisplayPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20 shadow-lg shadow-teal-500/5">
        <Tv className="size-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-white md:text-3xl">
        MedBook AI — TV Queue Display
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        To view your clinic&apos;s live waiting room queue display on a Smart TV, please
        open your clinic-specific link (for example:{" "}
        <code className="rounded bg-slate-800 px-2 py-0.5 font-mono text-teal-300">
          /display/queue/[clinic-slug]
        </code>
        ).
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <a
          href="/app/settings/tv-display"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
        >
          <Tv className="size-4" />
          View TV Display Settings
        </a>
        <a
          href="/app"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
        >
          Go to Dashboard
          <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  );
}
