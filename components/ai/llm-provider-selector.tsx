"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Loader } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import type { LlmProvider } from "@/types/database";

/**
 * Provider-specific configuration for LLM selection and API key management.
 * Supports Google Gemini (working), OpenAI (coming soon), Anthropic (coming soon).
 */

const PROVIDER_META: Record<LlmProvider, {
  label: string;
  status: "available" | "coming_soon";
  models: { value: string; label: string }[];
  keyPlaceholder: string;
  docs: string;
}> = {
  google: {
    label: "Google Gemini",
    status: "available",
    models: [
      { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (Recommended)" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    ],
    keyPlaceholder: "AIza...",
    docs: "https://ai.google.dev/docs",
  },
  openai: {
    label: "OpenAI GPT",
    status: "coming_soon",
    models: [
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-4", label: "GPT-4" },
    ],
    keyPlaceholder: "sk-...",
    docs: "https://platform.openai.com/docs",
  },
  anthropic: {
    label: "Anthropic Claude",
    status: "coming_soon",
    models: [
      { value: "claude-opus", label: "Claude 3 Opus" },
      { value: "claude-sonnet", label: "Claude 3 Sonnet" },
    ],
    keyPlaceholder: "sk-ant-...",
    docs: "https://docs.anthropic.com",
  },
};

export interface LlmProviderSelectorProps {
  provider: LlmProvider;
  model: string | null;
  apiKey?: string;
  isVerified?: boolean;
  verifiedAt?: string | null;
  onProviderChange: (provider: LlmProvider) => void;
  onModelChange: (model: string) => void;
  onApiKeyChange: (key: string) => void;
  canWrite: boolean;
  onVerify?: () => Promise<void>;
}

export function LlmProviderSelector({
  provider,
  model,
  apiKey = "",
  isVerified = false,
  verifiedAt,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
  canWrite,
  onVerify,
}: LlmProviderSelectorProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [verifying, startVerify] = useTransition();
  const meta = PROVIDER_META[provider];
  const isComingSoon = meta.status === "coming_soon";

  const handleVerify = async () => {
    if (!apiKey) {
      toast.error("Enter an API key first.");
      return;
    }

    startVerify(async () => {
      try {
        if (onVerify) {
          await onVerify();
          toast.success("API key verified!");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Verification failed"
        );
      }
    });
  };

  return (
    <div className="space-y-6 border-t border-text-muted/20 pt-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          AI Model Provider
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Connect your own API key for the AI agent, or use the platform default.
        </p>
      </div>

      {/* Provider Selection */}
      <div className="space-y-3">
        <Label>Select Provider</Label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(PROVIDER_META) as [LlmProvider, typeof PROVIDER_META[LlmProvider]][]).map(
            ([key, meta]) => (
              <button
                key={key}
                type="button"
                disabled={!canWrite || meta.status === "coming_soon"}
                onClick={() => onProviderChange(key)}
                className={`relative rounded-lg border-2 p-3 text-center transition-all ${
                  provider === key
                    ? "border-primary bg-primary/10"
                    : "border-text-muted/20 hover:border-text-muted/40"
                } ${
                  meta.status === "coming_soon"
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <p className="font-medium text-sm text-text-primary">
                  {meta.label}
                </p>
                {meta.status === "coming_soon" && (
                  <p className="text-xs text-text-muted mt-1">Coming soon</p>
                )}
                {provider === key && meta.status === "available" && (
                  <CheckCircle2 className="absolute top-2 right-2 size-4 text-primary" />
                )}
              </button>
            )
          )}
        </div>
      </div>

      {/* Model Selection */}
      {!isComingSoon && (
        <div className="space-y-2">
          <Label htmlFor="llm-model">Model</Label>
          <NativeSelect
            id="llm-model"
            value={model || ""}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!canWrite || isComingSoon}
          >
            <option value="">Use platform default</option>
            {meta.models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-text-muted">
            Leave blank to use the platform&apos;s default model for {meta.label}.
          </p>
        </div>
      )}

      {/* API Key Input */}
      {!isComingSoon && (
        <div className="space-y-3 rounded-lg bg-app p-4">
          <div className="space-y-2">
            <Label htmlFor="llm-api-key">API Key (BYO)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="llm-api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder={meta.keyPlaceholder}
                  disabled={!canWrite}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs font-medium"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              {apiKey && canWrite && (
                <Button
                  type="button"
                  variant={isVerified ? "outline" : "primary"}
                  onClick={handleVerify}
                  disabled={verifying}
                >
                  {verifying ? (
                    <>
                      <Loader className="mr-2 size-4 animate-spin" />
                      Verifying...
                    </>
                  ) : isVerified ? (
                    <>
                      <CheckCircle2 className="mr-2 size-4 text-status-success" />
                      Verified
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Status Messages */}
          {isVerified && verifiedAt && (
            <div className="flex items-start gap-2 rounded-control bg-status-success/10 p-3 border border-status-success/30">
              <CheckCircle2 className="size-4 text-status-success shrink-0 mt-0.5" />
              <div className="text-xs text-status-success">
                <p className="font-medium">API key verified</p>
                <p className="text-status-success/80 mt-0.5">
                  Last verified: {new Date(verifiedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {apiKey && !isVerified && (
            <div className="flex items-start gap-2 rounded-control bg-yellow-50 p-3 border border-yellow-200">
              <AlertCircle className="size-4 text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-800">
                <p className="font-medium">Verify your API key</p>
                <p className="text-yellow-700 mt-0.5">
                  Click &quot;Verify&quot; to test the key and enable it for your clinic.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-text-muted">
            Your API key is stored securely and never shared. It&apos;s used only to make API calls
            on behalf of your clinic.{" "}
            <a
              href={meta.docs}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Get an API key →
            </a>
          </p>
        </div>
      )}

      {isComingSoon && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm text-yellow-800">
            {meta.label} support is coming soon. For now, use the platform&apos;s {PROVIDER_META.google.label} integration.
          </p>
        </div>
      )}
    </div>
  );
}
