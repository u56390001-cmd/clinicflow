"use client";

import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import type { WebsiteConfig, WebsiteContent, WebsiteTheme, WebsiteSectionConfig } from "@/types/website";
import type { WebsiteImage } from "@/types/database";
import { WebsiteTemplate } from "@/components/website/template-index";
import { EditorSidebar } from "@/components/website/editor-sidebar";
import { saveWebsite, publishWebsite } from "@/lib/actions/website";
import { toast } from "sonner";

type Props = {
  clinicId: string;
  initialConfig: WebsiteConfig;
  initialImages: WebsiteImage[];
  clinicName: string;
  clinicDoctorName: string | null;
  clinicPhone: string | null;
  clinicEmail: string | null;
  clinicAddress: string | null;
  clinicSlug: string;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price: number;
    status: string;
  }>;
  availabilityRules: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: boolean;
  }>;
  initialStatus: "draft" | "published" | "unpublished";
};

type Action =
  | { type: "SET_TEMPLATE"; template: WebsiteConfig["template"] }
  | { type: "SET_CONTENT"; content: WebsiteContent }
  | { type: "SET_THEME"; theme: WebsiteTheme }
  | { type: "SET_HERO"; hero: WebsiteConfig["content"]["hero"] }
  | { type: "SET_ABOUT"; about: WebsiteConfig["content"]["about"] }
  | { type: "SET_CONTACT"; contact: WebsiteConfig["content"]["contact"] }
  | { type: "TOGGLE_SECTION"; sectionId: string }
  | { type: "REORDER_SECTIONS"; sections: WebsiteSectionConfig[] }
  | { type: "SET_IMAGES"; images: WebsiteImage[] }
  | { type: "HYDRATE"; config: WebsiteConfig; images: WebsiteImage[] };

function reducer(
  state: { config: WebsiteConfig; images: WebsiteImage[] },
  action: Action,
): { config: WebsiteConfig; images: WebsiteImage[] } {
  switch (action.type) {
    case "SET_TEMPLATE":
      return { ...state, config: { ...state.config, template: action.template } };
    case "SET_CONTENT":
      return { ...state, config: { ...state.config, content: action.content } };
    case "SET_THEME":
      return { ...state, config: { ...state.config, theme: action.theme } };
    case "SET_HERO":
      return {
        ...state,
        config: {
          ...state.config,
          content: { ...state.config.content, hero: action.hero },
        },
      };
    case "SET_ABOUT":
      return {
        ...state,
        config: {
          ...state.config,
          content: { ...state.config.content, about: action.about },
        },
      };
    case "SET_CONTACT":
      return {
        ...state,
        config: {
          ...state.config,
          content: { ...state.config.content, contact: action.contact },
        },
      };
    case "TOGGLE_SECTION":
      return {
        ...state,
        config: {
          ...state.config,
          content: {
            ...state.config.content,
            sections: state.config.content.sections.map((s) =>
              s.id === action.sectionId ? { ...s, visible: !s.visible } : s,
            ),
          },
        },
      };
    case "REORDER_SECTIONS":
      return {
        ...state,
        config: {
          ...state.config,
          content: { ...state.config.content, sections: action.sections },
        },
      };
    case "SET_IMAGES":
      return { ...state, images: action.images };
    case "HYDRATE":
      return { config: action.config, images: action.images };
    default:
      return state;
  }
}

export default function WebsiteEditorPage({
  clinicId,
  initialConfig,
  initialImages,
  clinicName,
  clinicDoctorName,
  clinicPhone,
  clinicEmail,
  clinicAddress,
  clinicSlug,
  services,
  availabilityRules,
  initialStatus,
}: Props) {
  const [state, dispatch] = useReducer(reducer, {
    config: initialConfig,
    images: initialImages,
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [publishStatus, setPublishStatus] = useState(initialStatus);
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload = JSON.stringify({
        template: state.config.template,
        content: state.config.content,
        theme: state.config.theme,
      });
      if (payload === lastSavedRef.current) return;
      lastSavedRef.current = payload;
      setSaveState("saving");
      const fd = new FormData();
      fd.set("template", state.config.template);
      fd.set("content", JSON.stringify(state.config.content));
      fd.set("theme", JSON.stringify(state.config.theme));
      const result = await saveWebsite(null, fd);
      setSaveState(result.ok ? "saved" : "idle");
      if (!result.ok) toast.error(result.message);
    }, 1500);
  }, [state.config]);

  useEffect(() => {
    triggerAutoSave();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.config, triggerAutoSave]);

  // Warn before leaving with unsaved changes (debounced save may be pending).
  const [dirty, setDirty] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    // Skip the initial mount — loading saved config is not an "unsaved change".
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setDirty(true);
  }, [state.config]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (saveState === "saved") setDirty(false);
  }, [saveState]);

  const handlePublish = async (status: "draft" | "published" | "unpublished") => {
    const fd = new FormData();
    fd.set("status", status);
    const result = await publishWebsite(null, fd);
    if (result.ok) {
      setPublishStatus(status);
      toast.success(`Website ${status === "published" ? "published" : status === "unpublished" ? "unpublished" : "set to draft"}.`);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-800">Website Builder</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {publishStatus === "published" ? "Published" : publishStatus === "unpublished" ? "Unpublished" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : ""}
          </span>
          {publishStatus === "published" ? (
            <button
              onClick={() => handlePublish("unpublished")}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={() => handlePublish("published")}
              className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-teal-700"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Mobile tab toggle */}
      <div className="flex border-b bg-white sm:hidden">
        <button
          onClick={() => setMobileTab("editor")}
          className={`flex-1 py-2 text-sm font-medium ${mobileTab === "editor" ? "border-b-2 text-teal-600" : "text-slate-500"}`}
          style={mobileTab === "editor" ? { borderColor: state.config.theme.primaryColor, color: state.config.theme.primaryColor } : undefined}
        >
          Editor
        </button>
        <button
          onClick={() => setMobileTab("preview")}
          className={`flex-1 py-2 text-sm font-medium ${mobileTab === "preview" ? "border-b-2 text-teal-600" : "text-slate-500"}`}
          style={mobileTab === "preview" ? { borderColor: state.config.theme.primaryColor, color: state.config.theme.primaryColor } : undefined}
        >
          Preview
        </button>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`w-full flex-shrink-0 overflow-y-auto border-r bg-slate-50 sm:w-96 ${mobileTab !== "editor" ? "hidden sm:block" : ""}`}>
          <EditorSidebar
            clinicId={clinicId}
            config={state.config}
            images={state.images}
            clinicName={clinicName}
            clinicDoctorName={clinicDoctorName}
            clinicPhone={clinicPhone}
            clinicEmail={clinicEmail}
            clinicAddress={clinicAddress}
            services={services}
            availabilityRules={availabilityRules}
            dispatch={dispatch}
          />
        </div>

        {/* Live preview */}
        <div className={`flex-1 overflow-y-auto bg-slate-100 ${mobileTab !== "preview" ? "hidden sm:block" : ""}`}>
          <div className="mx-auto max-w-5xl bg-white shadow-lg">
            <WebsiteTemplate
              config={state.config}
              images={state.images}
              clinic={{
                name: clinicName,
                doctor_name: clinicDoctorName,
                phone: clinicPhone,
                email: clinicEmail,
                address: clinicAddress,
              }}
              services={services}
              availabilityRules={availabilityRules}
              widgetSlug={clinicSlug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
