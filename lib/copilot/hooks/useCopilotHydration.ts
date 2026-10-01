import { useCallback } from 'react';
import { CopilotExtraction } from '@/lib/copilot/types';

interface FormMethods {
  setValue: (name: string, value: unknown, options?: { shouldDirty?: boolean }) => void;
}

export function useCopilotHydration(formMethods: FormMethods) {
  const populateForm = useCallback((extracted: CopilotExtraction) => {
    if (!extracted) return;

    // 1. Chief Complaint
    if (extracted.chief_complaint) {
      formMethods.setValue('chiefComplaint', extracted.chief_complaint, { shouldDirty: true });
    }

    // 2. Clinical Findings / Examination
    if (extracted.findings) {
      formMethods.setValue('findings', extracted.findings, { shouldDirty: true });
    }

    // 3. Diagnosis
    if (extracted.diagnosis) {
      formMethods.setValue('diagnosis', extracted.diagnosis, { shouldDirty: true });
    }

    // 4. Medicines Structured Array Grid
    if (extracted.medicines && extracted.medicines.length > 0) {
      const formattedMeds = extracted.medicines.map((m) => ({
        medicine_name: m.name,
        route_form: m.form || 'Tablet',
        frequency: m.frequency,
        duration: m.duration,
        duration_unit: m.unit || 'Days',
        instructions: m.instructions
      }));
      formMethods.setValue('medicines', formattedMeds, { shouldDirty: true });
    }

    // 5. Lab Orders Array
    if (extracted.lab_orders && extracted.lab_orders.length > 0) {
      const formattedLabs = extracted.lab_orders.map((l) => ({
        test_name: l.test_name,
        notes: l.notes || ''
      }));
      formMethods.setValue('lab_orders', formattedLabs, { shouldDirty: true });
    }

    // 6. Follow-up
    if (extracted.follow_up_after) {
      formMethods.setValue('followUpAfter', extracted.follow_up_after, { shouldDirty: true });
      formMethods.setValue('followUpUnit', extracted.follow_up_unit || 'Weeks', { shouldDirty: true });
    }
    if (extracted.follow_up_notes) {
      formMethods.setValue('followUpNotes', extracted.follow_up_notes, { shouldDirty: true });
    }

    // 7. Doctor Notes
    if (extracted.doctor_notes) {
      formMethods.setValue('doctorNotes', extracted.doctor_notes, { shouldDirty: true });
    }
  }, [formMethods]);

  return { populateForm };
}
