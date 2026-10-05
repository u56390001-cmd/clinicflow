import type { Metadata } from "next";
import Link from "next/link";
import { Tv, AlertCircle } from "lucide-react";

import { getTvDisplayClient } from "@/lib/supabase/tv-display";
import {
  TvQueueDisplay,
  type TvQueueItem,
  type TvClinicInfo,
} from "@/components/display/tv-queue-display";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params;
    if (!slug) return { title: "Live Queue Display" };

    const supabase = await getTvDisplayClient();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    let query = supabase.from("clinics").select("name");
    if (isUuid) {
      query = query.eq("id", slug);
    } else {
      query = query.eq("slug", slug);
    }

    const { data: clinic } = await query.maybeSingle();

    return {
      title: clinic?.name ? `${clinic.name} — Live TV Queue` : "Live Queue Display",
      description: "Live patient queue display for clinic waiting area",
      robots: "noindex, nofollow",
    };
  } catch (e) {
    console.error("[generateMetadata TV display error]", e);
    return {
      title: "Live Queue Display",
      robots: "noindex, nofollow",
    };
  }
}

export default async function DisplayQueueSlugPage({ params }: Props) {
  try {
    const { slug } = await params;

    if (!slug) {
      return <DisplayNotFound />;
    }

    const supabase = await getTvDisplayClient();

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    let clinicQuery = supabase
      .from("clinics")
      .select("id, name, slug, doctor_name, address, phone");

    if (isUuid) {
      clinicQuery = clinicQuery.eq("id", slug);
    } else {
      clinicQuery = clinicQuery.eq("slug", slug);
    }

    const { data: clinic, error: clinicError } = await clinicQuery.maybeSingle();

    if (clinicError || !clinic) {
      console.warn("[DisplayQueueSlugPage] clinic lookup failed", clinicError);
      return <DisplayNotFound />;
    }

    // Active visits from last 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: visits, error: visitsError },
      { data: patients },
      { data: doctors },
    ] = await Promise.all([
      supabase
        .from("visits")
        .select(
          "id, token_number, queue_position, status, checked_in_at, consultation_started_at, doctor_id, patient_id",
        )
        .eq("clinic_id", clinic.id)
        .in("status", ["waiting", "in_consultation"])
        .gte("checked_in_at", cutoff)
        .order("queue_position", { ascending: true }),
      supabase
        .from("patients")
        .select("id, name, patient_code")
        .eq("clinic_id", clinic.id),
      supabase
        .from("doctors")
        .select("id, name, specialty")
        .eq("clinic_id", clinic.id),
    ]);

    if (visitsError) {
      console.warn("[DisplayQueueSlugPage] visits query error", visitsError);
    }

    const patientsMap = new Map(patients?.map((p) => [p.id, p]) ?? []);
    const doctorsMap = new Map(doctors?.map((d) => [d.id, d]) ?? []);

    const allActive: TvQueueItem[] = (visits ?? []).map((v) => {
      const patient = patientsMap.get(v.patient_id);
      const doctor = v.doctor_id ? doctorsMap.get(v.doctor_id) : null;

      return {
        id: v.id,
        tokenNumber: v.token_number,
        queuePosition: v.queue_position,
        status: v.status as "waiting" | "in_consultation",
        checkedInAt: v.checked_in_at,
        consultationStartedAt: v.consultation_started_at,
        patientName: patient?.name ?? "Patient",
        patientCode: patient?.patient_code ?? null,
        doctorName: doctor?.name ?? clinic.doctor_name ?? null,
        doctorSpecialty: doctor?.specialty ?? null,
      };
    });

    const inConsultation = allActive.filter(
      (item) => item.status === "in_consultation",
    );
    const waiting = allActive.filter((item) => item.status === "waiting");

    const clinicInfo: TvClinicInfo = {
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug,
      doctorName: clinic.doctor_name,
    };

    return (
      <TvQueueDisplay
        clinic={clinicInfo}
        initialInConsultation={inConsultation}
        initialWaiting={waiting}
      />
    );
  } catch (error) {
    console.error("[TV Display Route Error]:", error);
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
          <AlertCircle className="size-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-white md:text-3xl">
          Queue Display Temporarily Unavailable
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          We could not load the waiting room queue at this moment. Please check your
          connection or refresh the screen.
        </p>
        <div className="mt-6">
          <Link
            href="/app/settings/tv-display"
            className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
          >
            <Tv className="size-4" />
            Go to TV Display Settings
          </Link>
        </div>
      </div>
    );
  }
}

function DisplayNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20">
        <AlertCircle className="size-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-white md:text-3xl">
        TV Display Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The clinic queue display link you opened is invalid or does not exist. Please
        make sure you have the correct clinic URL from your Clinic Settings.
      </p>
      <div className="mt-8">
        <Link
          href="/app/settings/tv-display"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400"
        >
          <Tv className="size-4" />
          Go to TV Display Settings
        </Link>
      </div>
    </div>
  );
}