import { NextResponse, type NextRequest } from "next/server";
import { getTvDisplayClient } from "@/lib/supabase/tv-display";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { slug } = await params;

    if (!slug) {
      return NextResponse.json(
        { ok: false, message: "Clinic slug is required" },
        { status: 400 },
      );
    }

    const supabase = await getTvDisplayClient();

    // 1. Look up clinic by slug (or by id if UUID)
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
      return NextResponse.json(
        { ok: false, message: "Clinic not found" },
        { status: 404 },
      );
    }

    // 2. Fetch today's visits (or recent active visits from last 24h)
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
      console.warn("[TV display API] visitsError", visitsError);
    }

    const patientsMap = new Map(patients?.map((p) => [p.id, p]) ?? []);
    const doctorsMap = new Map(doctors?.map((d) => [d.id, d]) ?? []);

    const allActive = (visits ?? []).map((v) => {
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

    return NextResponse.json(
      {
        ok: true,
        clinic: {
          id: clinic.id,
          name: clinic.name,
          slug: clinic.slug,
          doctorName: clinic.doctor_name,
        },
        inConsultation,
        waiting,
        totalActiveCount: allActive.length,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[TV Display API error]:", error);
    return NextResponse.json(
      { ok: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
