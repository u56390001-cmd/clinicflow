import { cn } from "@/lib/utils";
import type { IntegrationKey } from "@/types/database";

/**
 * Brand marks for the integrations catalogue.
 *
 * These are the vendors' own logos, traced from the design document's SVGs
 * rather than approximated with a Lucide glyph — a generic video-camera icon
 * next to the words "Zoom Consultations" is worse than no icon, because it
 * claims a resemblance the shape does not have.
 *
 * Each tile is a `w-10 h-10` rounded surface with a soft brand-tinted border,
 * matching the mockup. The `primary` tint is the project teal rather than the
 * mockup's indigo, so the Queue tile sits in the same palette as everything
 * else in the app.
 */
const TILE_CLASSES =
  "flex size-10 shrink-0 items-center justify-center rounded-card border";

type TileTone = "blue" | "emerald" | "indigo" | "primary" | "green" | "red";

const TILE_TONES: Record<TileTone, string> = {
  blue: "bg-blue-50 border-blue-100",
  emerald: "bg-emerald-50 border-emerald-100",
  indigo: "bg-indigo-50 border-indigo-100",
  primary: "bg-primary-light border-primary-border",
  green: "bg-green-50 border-green-100",
  red: "bg-red-50 border-red-100",
};

export function IntegrationIcon({
  integrationKey,
  className,
}: {
  integrationKey: IntegrationKey;
  className?: string;
}) {
  const tone: TileTone =
    integrationKey === "gcal"
      ? "blue"
      : integrationKey === "gmeet"
        ? "emerald"
        : integrationKey === "gsheets"
          ? "green"
          : integrationKey === "zoom"
            ? "blue"
            : integrationKey === "msteams"
              ? "indigo"
              : integrationKey === "queue"
                ? "primary"
                : integrationKey === "whatsapp"
                  ? "emerald"
                  : "red";

  return (
    <div className={cn(TILE_CLASSES, TILE_TONES[tone], className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {integrationKey === "gcal" && (
          <>
            <rect x="3" y="4" width="18" height="18" rx="3" fill="#4285F4" />
            <path
              d="M3 8H21V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V8Z"
              fill="white"
            />
            <text
              x="12"
              y="17"
              fontSize="9"
              fontWeight="bold"
              fill="#4285F4"
              textAnchor="middle"
            >
              31
            </text>
            <rect x="7" y="2" width="2" height="4" rx="1" fill="#EA4335" />
            <rect x="15" y="2" width="2" height="4" rx="1" fill="#EA4335" />
          </>
        )}

        {integrationKey === "gmeet" && (
          <>
            <path d="M14 12L18 9V15L14 12Z" fill="#00832D" />
            <rect x="3" y="6" width="11" height="12" rx="2" fill="#00AC47" />
          </>
        )}

        {integrationKey === "gsheets" && (
          <>
            <rect x="4" y="3" width="16" height="18" rx="2" fill="#0F9D58" />
            <rect x="7" y="7" width="10" height="2" fill="white" />
            <rect x="7" y="11" width="10" height="2" fill="white" />
            <rect x="7" y="15" width="10" height="2" fill="white" />
          </>
        )}

        {integrationKey === "zoom" && (
          <>
            <rect width="24" height="24" rx="5" fill="#2D8CFF" />
            <path
              d="M5 9.5C5 8.67 5.67 8 6.5 8H14.5C15.33 8 16 8.67 16 9.5V14.5C16 15.33 15.33 16 14.5 16H6.5C5.67 16 5 15.33 5 14.5V9.5Z"
              fill="white"
            />
            <path d="M17 10.5L19.5 8.5V15.5L17 13.5V10.5Z" fill="white" />
          </>
        )}

        {integrationKey === "msteams" && (
          <>
            <rect width="24" height="24" rx="5" fill="#464EB8" />
            <path
              d="M14.5 8C15.33 8 16 8.67 16 9.5V14.5C16 15.33 15.33 16 14.5 16H9.5C8.67 16 8 15.33 8 14.5V9.5C8 8.67 8.67 8 9.5 8H14.5Z"
              fill="white"
            />
            <text x="7" y="15" fontSize="9" fontWeight="bold" fill="white">
              T
            </text>
          </>
        )}

        {integrationKey === "queue" && (
          <>
            {/* Two people, two bars — the project teal replaces the mockup's
                indigo so the first-party tile matches the app's palette. */}
            <circle cx="7" cy="8" r="2" className="fill-primary" />
            <circle cx="7" cy="16" r="2" className="fill-primary/50" />
            <rect x="12" y="7" width="8" height="2" rx="1" className="fill-primary" />
            <rect x="12" y="15" width="8" height="2" rx="1" className="fill-primary/50" />
          </>
        )}

        {integrationKey === "whatsapp" && (
          <>
            <rect width="24" height="24" rx="5" fill="#25D366" />
            <path
              d="M17.5 14.3C17.1 14.1 15.3 13.2 15 13.1C14.7 13 14.5 13 14.3 13.3C14.1 13.6 13.5 14.3 13.3 14.5C13.1 14.7 12.9 14.7 12.5 14.5C12.1 14.3 10.8 13.8 9.2 12.4C8 11.3 7.2 9.9 7 9.5C6.8 9.1 7 8.9 7.2 8.7C7.4 8.5 7.6 8.2 7.8 8C8 7.8 8.1 7.6 8.2 7.4C8.3 7.2 8.2 7 8.1 6.8C8 6.6 7.3 5 7 4.3C6.7 3.6 6.4 3.7 6.2 3.7H5.6C5.4 3.7 5 3.8 4.7 4.1C4.4 4.4 3.5 5.2 3.5 6.9C3.5 8.6 4.7 10.3 4.9 10.5C5.1 10.7 7.3 14.1 10.8 15.6C11.6 16 12.3 16.2 12.8 16.4C13.6 16.7 14.4 16.6 15 16.5C15.7 16.4 17.1 15.6 17.4 14.8C17.7 14 17.7 13.3 17.6 13.1C17.8 14.4 17.5 14.3 17.5 14.3Z"
              fill="white"
            />
          </>
        )}

        {integrationKey === "smsgateway" && (
          <>
            <rect width="24" height="24" rx="5" fill="#F22F46" />
            <circle cx="8" cy="12" r="3" fill="white" />
            <circle cx="16" cy="12" r="3" fill="white" />
          </>
        )}
      </svg>
    </div>
  );
}
