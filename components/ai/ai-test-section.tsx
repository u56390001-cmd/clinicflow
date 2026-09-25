import { AiTestChat } from "@/components/ai/ai-test-chat";
import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";

export async function AiTestSection() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Test the AI Agent
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Chat with your clinic&apos;s AI assistant.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  if (!canWriteClinic(access.role)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Test the AI Agent
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Test your intelligent WhatsApp assistant.
          </p>
        </div>
        <p className="text-sm text-text-secondary">
          Only owners and admins can test the AI receptionist. Ask an owner or
          admin to open this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Test the AI Agent
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Test your intelligent WhatsApp assistant.
        </p>
      </div>

      <AiTestChat clinicName={access.clinic.name} />
    </div>
  );
}
