"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, Plus, X } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { saveAiSettingsAction, verifyLlmApiKeyAction } from "@/lib/actions/ai-settings";
import { getSiteUrl } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type {
  AiAgentTier,
  AiGreetingStyle,
  ClinicAiSettings,
  WidgetPosition,
} from "@/types/database";
import {
  WhatsappConnectCard,
  type WhatsappConfigView,
} from "@/components/ai/whatsapp-connect-card";
import { LlmProviderSelector } from "@/components/ai/llm-provider-selector";
import type { LlmProvider } from "@/types/database";

type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  isCustom: boolean;
};

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "empathetic", label: "Empathetic" },
  { value: "casual", label: "Casual" },
] as const;

const AGENT_TIERS = [
  { value: "ai_agent", label: "AI agent — natural conversation (recommended)" },
  { value: "chatbot", label: "Menu-based chatbot (coming soon)" },
] as const;

const GREETING_STYLES = [
  { value: "custom_template", label: "Use my welcome message" },
  { value: "ai_generated", label: "Let the AI write the greeting" },
] as const;

const FIELD_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
] as const;

function asFaqs(raw: unknown): FaqEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      id:
        typeof entry.id === "string" && entry.id
          ? entry.id
          : crypto.randomUUID(),
      question:
        typeof entry.question === "string" ? entry.question.slice(0, 240) : "",
      answer:
        typeof entry.answer === "string" ? entry.answer.slice(0, 2000) : "",
      active: entry.active !== false,
      isCustom: entry.is_custom !== false,
    }))
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0);
}

const initialState: ActionResult | null = null;

export function AiSettingsForm({
  settings,
  whatsappConfig,
  canWrite,
  clinicSlug,
}: {
  settings: ClinicAiSettings | null;
  whatsappConfig: WhatsappConfigView | null;
  canWrite: boolean;
  clinicSlug: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveAiSettingsAction,
    initialState,
  );

  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [agentName, setAgentName] = useState(settings?.agent_name ?? "MedBook Assistant");
  const [welcomeMessage, setWelcomeMessage] = useState(settings?.welcome_message ?? "");
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>(settings?.tone ?? "professional");
  const [agentTier, setAgentTier] = useState<AiAgentTier>(settings?.agent_tier ?? "ai_agent");
  const [greetingStyle, setGreetingStyle] = useState<AiGreetingStyle>(
    settings?.greeting_style ?? "custom_template",
  );
  // WhatsApp channel toggle (Phase 12) — independent of enabled / isActivated.
  const [whatsappEnabled, setWhatsappEnabled] = useState(settings?.whatsapp_enabled ?? false);
  const [clinicDescription, setClinicDescription] = useState(settings?.clinic_description ?? "");
  const [bookingRules, setBookingRules] = useState(settings?.booking_rules ?? "");
  const [cancellationPolicyText, setCancellationPolicyText] = useState(
    settings?.cancellation_policy_text ?? "",
  );
  const [faqs, setFaqs] = useState<FaqEntry[]>(asFaqs(settings?.faqs));
  const [requiredPatientFields, setRequiredPatientFields] = useState<string[]>(
    settings?.required_patient_fields?.length
      ? settings.required_patient_fields
      : ["name"],
  );

  // Widget appearance state (Phase 6)
  const [isActivated, setIsActivated] = useState(settings?.is_activated ?? false);
  const [widgetColor, setWidgetColor] = useState(settings?.widget_color ?? "#0D9488");
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(
    settings?.widget_position ?? "bottom-right",
  );
  const [widgetAvatarUrl, setWidgetAvatarUrl] = useState(settings?.widget_avatar_url ?? "");
  const [widgetHeaderSubtitle, setWidgetHeaderSubtitle] = useState(settings?.widget_header_subtitle ?? "");
  const [copiedEmbed, setCopiedEmbed] = useState<"js" | "iframe" | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase 8 — LLM provider selection
  const [llmProvider, setLlmProvider] = useState<LlmProvider>(settings?.llm_provider ?? "google");
  const [llmModel, setLlmModel] = useState(settings?.llm_model ?? "");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmKeyVerified, setLlmKeyVerified] = useState(
    settings?.llm_key_verified ?? false,
  );

  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  function toggleRequiredField(field: string): void {
    setRequiredPatientFields((current) =>
      current.includes(field)
        ? current.filter((value) => value !== field)
        : [...current, field],
    );
  }

  function updateFaq(index: number, patch: Partial<FaqEntry>): void {
    setFaqs((current) =>
      current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    );
  }

  function addFaq(): void {
    setFaqs((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        question: "",
        answer: "",
        active: true,
        isCustom: true,
      },
    ]);
  }

  function toggleFaqActive(index: number, active: boolean): void {
    setFaqs((current) =>
      current.map((entry, i) => (i === index ? { ...entry, active } : entry)),
    );
  }

  function removeFaq(index: number): void {
    setFaqs((current) => current.filter((_, i) => i !== index));
  }

  function copyToClipboard(text: string, type: "js" | "iframe"): void {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedEmbed(type);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedEmbed(null), 2000);
    });
  }

  async function handleVerifyLlmKey(): Promise<void> {
    const result = await verifyLlmApiKeyAction(
      llmProvider,
      llmApiKey,
      llmModel || null,
    );
    if (!result.ok) {
      throw new Error(result.message ?? "API key verification failed.");
    }
    setLlmKeyVerified(true);
  }

  const siteUrl = getSiteUrl();
  const embedJsCode = `<script src="${siteUrl}/widget.js" data-clinic="${clinicSlug}"></script>`;
  const embedIframeCode = `<iframe src="${siteUrl}/widget/${clinicSlug}" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;max-width:420px"></iframe>`;

  const textareaClass =
    "flex min-h-[5.5rem] w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

  const payload = JSON.stringify({
    enabled,
    agentName,
    welcomeMessage,
    tone,
    agentTier,
    greetingStyle,
    whatsappEnabled,
    clinicDescription,
    bookingRules,
    cancellationPolicyText,
    faqs: faqs.map((entry) => ({
      id: entry.id,
      question: entry.question,
      answer: entry.answer,
      active: entry.active,
      is_custom: entry.isCustom,
    })),
    requiredPatientFields,
    isActivated,
    widgetColor,
    widgetPosition,
    widgetAvatarUrl,
    widgetHeaderSubtitle,
    llmProvider,
    llmModel,
    llmApiKey,
  });

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>AI Agent</CardTitle>
          <CardDescription>
            {canWrite
              ? "Configure how the AI assistant answers patients and books appointments."
              : "Read-only for staff. Ask an owner or admin to make changes."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canWrite}
            aria-label="Enable the AI receptionist"
          />
          <span className="text-sm font-medium text-text-primary">
            {enabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {submitted && !state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>AI settings saved.</AlertDescription>
          </Alert>
        )}

        <form action={formAction} noValidate className="space-y-6">
          <input type="hidden" name="payload" value={payload} />

          <div className="space-y-2">
            <Label htmlFor="agent-name">Agent name</Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="MedBook Assistant"
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcome-message">Welcome message</Label>
            <Input
              id="welcome-message"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Hi, thanks for reaching out to us! How can I help?"
              disabled={!canWrite}
            />
            <p className="text-xs text-text-muted">
              Shown as the opening line when a patient starts a conversation.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting-style">Greeting style</Label>
            <NativeSelect
              id="greeting-style"
              value={greetingStyle}
              onChange={(e) =>
                setGreetingStyle(e.target.value as AiGreetingStyle)
              }
              disabled={!canWrite}
            >
              {GREETING_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-text-muted">
              &quot;Use my welcome message&quot; always opens with the line above.
              &quot;Let the AI write the greeting&quot; drafts a fresh one each conversation,
              in your chosen tone.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tone">Tone</Label>
            <NativeSelect
              id="tone"
              value={tone}
              onChange={(e) =>
                setTone(e.target.value as (typeof TONES)[number]["value"])
              }
              disabled={!canWrite}
            >
              {TONES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-text-muted">
              Applied everywhere the assistant speaks — test chat, website widget and WhatsApp.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-tier">Agent tier</Label>
            <NativeSelect
              id="agent-tier"
              value={agentTier}
              onChange={(e) => setAgentTier(e.target.value as AiAgentTier)}
              disabled={!canWrite}
            >
              {AGENT_TIERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinic-description">Clinic description</Label>
            <textarea
              id="clinic-description"
              value={clinicDescription}
              onChange={(e) => setClinicDescription(e.target.value)}
              placeholder="A short description of your clinic, services and what patients can expect."
              disabled={!canWrite}
              className={textareaClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-rules">Booking rules</Label>
            <textarea
              id="booking-rules"
              value={bookingRules}
              onChange={(e) => setBookingRules(e.target.value)}
              placeholder="e.g. Please arrive 10 minutes early. Appointment changes require 24 hours notice."
              disabled={!canWrite}
              className={textareaClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancellation-policy">Cancellation policy</Label>
            <textarea
              id="cancellation-policy"
              value={cancellationPolicyText}
              onChange={(e) => setCancellationPolicyText(e.target.value)}
              placeholder="e.g. Please cancel at least 24 hours in advance. Late cancellations may be charged."
              disabled={!canWrite}
              className={textareaClass}
            />
          </div>

          <div className="space-y-3">
            <div>
              <Label>FAQs / Knowledge</Label>
              <p className="mt-1 text-xs text-text-muted">
                The assistant uses your active FAQs to answer clinic-specific
                questions exactly as configured. Inactive FAQs are kept but
                excluded from the AI&apos;s knowledge.
              </p>
            </div>
            <ul className="space-y-3">
              {faqs.map((entry, index) => (
                <li
                  key={entry.id}
                  className={cn(
                    "rounded-control border border-text-muted/30 p-3 space-y-3",
                    !entry.active && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
                      <Switch
                        checked={entry.active}
                        onCheckedChange={(checked) =>
                          canWrite && toggleFaqActive(index, checked)
                        }
                        disabled={!canWrite}
                        aria-label={`FAQ ${index + 1} active`}
                      />
                      Active
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-control border border-text-muted/30 bg-app px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                        {entry.isCustom ? "Custom" : "Starter"}
                      </span>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => removeFaq(index)}
                          aria-label={`Remove FAQ ${index + 1}`}
                          className="rounded-control p-1.5 text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        aria-label={`FAQ ${index + 1} question`}
                        value={entry.question}
                        onChange={(e) =>
                          updateFaq(index, { question: e.target.value })
                        }
                        placeholder="Question"
                        disabled={!canWrite}
                      />
                      <textarea
                        aria-label={`FAQ ${index + 1} answer`}
                        value={entry.answer}
                        onChange={(e) =>
                          updateFaq(index, { answer: e.target.value })
                        }
                        placeholder="Answer"
                        disabled={!canWrite}
                        className={cn(textareaClass, "min-h-[4.5rem]")}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {canWrite && (
              <button
                type="button"
                onClick={addFaq}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add FAQ
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Required patient details</Label>
            <p className="text-xs text-text-muted">
              The assistant must collect these before booking an appointment.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {FIELD_OPTIONS.map((option) => {
                const checked = requiredPatientFields.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className="flex items-center justify-between gap-3 rounded-control border border-text-muted/30 bg-surface px-3 py-2.5 transition-colors hover:border-text-muted/70"
                  >
                    <span className="text-sm font-medium text-text-primary">
                      {option.label}
                    </span>
                    <Switch
                      checked={checked}
                      onCheckedChange={() => toggleRequiredField(option.value)}
                      disabled={!canWrite}
                      aria-label={`Require patient ${option.label}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Widget Configuration (Phase 6) ─────────────────────── */}
          <div className="border-t border-text-muted/20 pt-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  Public widget
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Configure the embeddable chat widget that appears on your website.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={isActivated}
                  onCheckedChange={setIsActivated}
                  disabled={!canWrite}
                  aria-label="Activate public AI widget"
                />
                <span className="text-sm font-medium text-text-primary">
                  {isActivated ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {!isActivated && (
              <p className="text-xs text-text-muted">
                The widget won&apos;t appear on your website until activated.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="widget-color">Widget color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="widget-color"
                    value={widgetColor}
                    onChange={(e) => setWidgetColor(e.target.value)}
                    disabled={!canWrite}
                    className="h-9 w-14 cursor-pointer rounded-control border border-text-muted/40 bg-surface"
                  />
                  <Input
                    value={widgetColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setWidgetColor(v);
                    }}
                    placeholder="#0D9488"
                    disabled={!canWrite}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="widget-position">Widget position</Label>
                <NativeSelect
                  id="widget-position"
                  value={widgetPosition}
                  onChange={(e) =>
                    setWidgetPosition(e.target.value as WidgetPosition)
                  }
                  disabled={!canWrite}
                >
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-subtitle">Header subtitle</Label>
              <Input
                id="widget-subtitle"
                value={widgetHeaderSubtitle}
                onChange={(e) => setWidgetHeaderSubtitle(e.target.value)}
                placeholder={clinicSlug}
                disabled={!canWrite}
              />
              <p className="text-xs text-text-muted">
                Shown under the agent name in the chat header. Defaults to the
                clinic name.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="widget-avatar">Avatar URL</Label>
              <Input
                id="widget-avatar"
                value={widgetAvatarUrl}
                onChange={(e) => setWidgetAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                disabled={!canWrite}
              />
              <p className="text-xs text-text-muted">
                Optional image URL for the agent avatar in the chat header.
              </p>
            </div>

            {/* Widget preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="relative flex h-48 items-end justify-end rounded-control border border-text-muted/20 bg-gray-50 p-4"
                style={{ direction: widgetPosition === "bottom-left" ? "ltr" : "rtl" }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 48,
                    height: 48,
                    background: widgetColor,
                    boxShadow: `0 4px 14px rgba(0,0,0,0.2), 0 0 0 4px ${widgetColor}20`,
                    direction: "ltr",
                  }}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Embed codes */}
            {isActivated && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>JavaScript embed</Label>
                  <p className="text-xs text-text-muted">
                    Paste this snippet before the closing{" "}
                    <code className="rounded bg-app px-1 py-0.5 text-xs">
                      &lt;/body&gt;
                    </code>{" "}
                    tag on your website.
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-control border border-text-muted/30 bg-app p-3 pr-10 text-xs text-text-primary">
                      {embedJsCode}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(embedJsCode, "js")}
                      className="absolute right-2 top-2 rounded-control p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                      aria-label="Copy JavaScript embed code"
                    >
                      {copiedEmbed === "js" ? (
                        <CheckCircle2 className="h-4 w-4 text-status-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>iframe embed</Label>
                  <p className="text-xs text-text-muted">
                    Embed the widget directly as an iframe on your page.
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-control border border-text-muted/30 bg-app p-3 pr-10 text-xs text-text-primary">
                      {embedIframeCode}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(embedIframeCode, "iframe")}
                      className="absolute right-2 top-2 rounded-control p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                      aria-label="Copy iframe embed code"
                    >
                      {copiedEmbed === "iframe" ? (
                        <CheckCircle2 className="h-4 w-4 text-status-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── WhatsApp (Phase 12) ─────────────────────────────────── */}
          <div className="border-t border-text-muted/20 pt-6 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">
                  WhatsApp
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Connect your WhatsApp Business number and control how the
                  assistant behaves on it.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={whatsappEnabled}
                  onCheckedChange={setWhatsappEnabled}
                  disabled={!canWrite}
                  aria-label="Enable the AI receptionist on WhatsApp"
                />
                <span className="text-sm font-medium text-text-primary">
                  {whatsappEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>

            {!whatsappEnabled && (
              <p className="text-xs text-text-muted">
                Independent of the test chat and website widget toggles — the
                assistant only answers on channels you switch on.
              </p>
            )}

            <WhatsappConnectCard config={whatsappConfig} canWrite={canWrite} />
          </div>

          {/*── LLM Provider Configuration (Phase 8) ──────────────────*/}
          <LlmProviderSelector
            provider={llmProvider}
            model={llmModel}
            apiKey={llmApiKey}
            isVerified={llmKeyVerified}
            verifiedAt={settings?.llm_key_verified_at}
            onProviderChange={setLlmProvider}
            onModelChange={setLlmModel}
            onApiKeyChange={setLlmApiKey}
            onVerify={handleVerifyLlmKey}
            canWrite={canWrite}
          />

          {canWrite && (
            <SubmitButton loadingText="Saving…" className="w-full" size="lg">
              Save AI settings
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
