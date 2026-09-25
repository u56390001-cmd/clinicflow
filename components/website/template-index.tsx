import { TemplateModern } from "./template-modern";
import { TemplateClassic } from "./template-classic";
import { TemplateMinimal } from "./template-minimal";
import type { WebsiteConfig } from "@/types/website";

export type TemplateProps = {
  config: WebsiteConfig;
  images: Array<{
    id: string;
    kind: string;
    url: string;
    alt: string;
    position: number;
  }>;
  clinic: {
    name: string;
    doctor_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
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
  widgetSlug: string;
};

const TEMPLATES = {
  modern: TemplateModern,
  classic: TemplateClassic,
  minimal: TemplateMinimal,
} as const;

export function WebsiteTemplate({
  config,
  ...rest
}: TemplateProps) {
  const TemplateComponent = TEMPLATES[config.template] ?? TemplateModern;
  return <TemplateComponent config={config} {...rest} />;
}
