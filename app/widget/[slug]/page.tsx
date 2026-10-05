import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { WidgetChat } from "@/components/widget/widget-chat";
import { createWidgetClient } from "@/lib/supabase/widget";
import { CLINIC_SLUG_REGEX } from "@/lib/constants";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!CLINIC_SLUG_REGEX.test(slug)) return { title: "AI Assistant" };

  const supabase = createWidgetClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  return {
    title: clinic ? `${clinic.name} — AI Assistant` : "AI Assistant",
    robots: "noindex, nofollow",
  };
}

/**
 * Standalone public widget page — embeddable via iframe on any website.
 * No app shell, no auth guard. Renders the full chat UI or a graceful
 * "not available" state.
 *
 * Note: does NOT render its own <html>/<body> tags — the root layout
 * handles those. WidgetChat uses position:fixed;inset:0 to cover the
 * full viewport. This avoids the hydration mismatch that would occur
 * from nesting html/body inside the root layout's html/body.
 */
export default async function WidgetPage({ params }: Props) {
  const { slug } = await params;

  if (!CLINIC_SLUG_REGEX.test(slug)) {
    notFound();
  }

  const supabase = createWidgetClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!clinic) {
    return <WidgetUnavailable />;
  }

  const { data: settings } = await supabase
    .from("clinic_ai_settings")
    .select("is_activated, enabled, widget_color, widget_position, widget_avatar_url, widget_header_subtitle, agent_name, welcome_message")
    .eq("clinic_id", clinic.id)
    .maybeSingle();

  if (!settings || !settings.is_activated || !settings.enabled) {
    return <WidgetUnavailable />;
  }

  return (
    <>
      {/* The widget is `position: fixed` and pointer-transparent apart from its
          own panel, so this is purely what a direct visitor sees behind it.
          Without it the route is blank white with a lone button in the corner,
          which reads as a broken page rather than a chat window — and this URL
          is still the one an iframe embed or a bookmarked link lands on. */}
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
          backgroundColor: "#F8FAFC",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 1.25rem",
              borderRadius: "9999px",
              backgroundColor: settings.widget_color ?? "#0D9488",
              opacity: 0.12,
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "#0F172A",
            }}
          >
            {clinic.name}
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#64748B",
            }}
          >
            Questions about treatments, doctors or appointments? Our assistant
            can help you book.
          </p>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `*{margin:0;padding:0;box-sizing:border-box}`,
        }}
      />
      <WidgetChat
        slug={clinic.slug}
        clinicName={clinic.name}
        widgetColor={settings.widget_color}
        widgetPosition={settings.widget_position}
        avatarUrl={settings.widget_avatar_url}
        headerSubtitle={settings.widget_header_subtitle}
        agentName={settings.agent_name}
        welcomeMessage={settings.welcome_message}
      />
    </>
  );
}

function WidgetUnavailable() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        color: "#6B7280",
        backgroundColor: "#F9FAFB",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div>
        <p style={{ fontSize: "1rem", fontWeight: 500 }}>
          This AI assistant isn&apos;t available right now.
        </p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem", color: "#9CA3AF" }}>
          Please try again later or contact the clinic directly.
        </p>
      </div>
    </div>
  );
}
