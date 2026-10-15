# Phase 2: Core Patient & EHR Infrastructure Implementation Prompt

## Objective
Implement the core patient management system, clinical records structure, and real-time appointment scheduling interface for the **ClinicFlow** platform. Focus on building database-backed schemas, API endpoints, and Next.js frontend components with strict multi-tenant Row-Level Security (RLS).

---

## 1. Database Schema & Supabase RLS

### Requirements
Create a migration file in `supabase/migrations/` to define tables, indexes, and RLS policies for Patients, Appointments, and Medical Records.

```sql
-- Core Enums
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unknown');

-- Patients Table
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dob DATE NOT NULL,
    gender gender_type NOT NULL DEFAULT 'unknown',
    phone TEXT,
    email TEXT,
    address JSONB DEFAULT '{}'::jsonb,
    medical_history JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appointments Table
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.clinic_members(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medical Records Table (Encounters/Notes)
CREATE TABLE public.medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.clinic_members(id),
    appointment_id UUID REFERENCES public.appointments(id),
    chief_complaint TEXT,
    diagnosis TEXT,
    treatment_plan TEXT,
    vitals JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

-- Multi-Tenant RLS Policy Pattern (Apply to all tables)
CREATE POLICY "Tenant isolation for patients" ON public.patients
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM public.clinic_members 
            WHERE user_id = auth.uid()
        )
    );
```

---

## 2. API Routes & Server Actions

Implement Server Actions in `app/actions/patients.ts` and `app/actions/appointments.ts` using **Zod** for strict validation:

### Zod Schemas (`lib/validations/patient.ts`)
```typescript
import { z } from "zod";

export const patientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  gender: z.enum(["male", "female", "other", "unknown"]),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export const appointmentSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().optional(),
});
```

---

## 3. Dynamic UI Components

Build reusable, accessible UI components in `components/`:

1. **Patient Directory Table (`components/patients/patient-table.tsx`)**:
   - Dynamic search by name or phone.
   - Server-side pagination.
   - Status indicators and action menus.

2. **Appointment Scheduling Drawer (`components/appointments/booking-drawer.tsx`)**:
   - Provider availability selector.
   - Time slot picker displaying available slots dynamically.
   - Instant optimistic feedback upon creation.

3. **Medical Record Stream View (`components/records/record-timeline.tsx`)**:
   - Timeline component for past patient visits, diagnoses, and vitals.

---

## 4. Execution Checklist & Instructions

1. **Run Migration**: Apply the database migration to Supabase.
2. **Types Generation**: Run `supabase gen types typescript --local > types/supabase.ts`.
3. **Build Form Components**: Ensure forms use `@hookform/resolvers` with the defined Zod schemas.
4. **Verification**: Run local RLS tests to verify user from Clinic A cannot view patients or appointments from Clinic B.
```

eof