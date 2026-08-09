import Link from "next/link";
import {
  ArrowLeftRight,
  Building2,
  Coins,
  type LucideIcon,
} from "lucide-react";

import { FormSection } from "@/design-system/form-layout";
import { Typography } from "@/design-system/typography";

type SettingsModule = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const CATALOG_MODULES: SettingsModule[] = [
  {
    href: "/settings/currencies",
    title: "Currencies",
    description: "Add, edit, and activate currencies used across the shop.",
    icon: Coins,
  },
  {
    href: "/settings/exchange-rates",
    title: "Exchange Rates",
    description: "Enter FX rates such as 1 USD = 70 AFN for future exchange.",
    icon: ArrowLeftRight,
  },
  {
    href: "/partner-sarafi",
    title: "Partner Sarafis",
    description:
      "Manage counterpart sarafis you send hawala to or receive hawala from.",
    icon: Building2,
  },
];

function ModuleList({ modules }: { modules: SettingsModule[] }) {
  return (
    <ul className="space-y-3">
      {modules.map((section) => {
        const Icon = section.icon;

        return (
          <li key={section.href}>
            <Link
              href={section.href}
              className="bg-card hover:bg-muted/40 focus-visible:ring-ring flex items-start gap-4 rounded-xl px-3 py-2 shadow-sm ring-1 ring-foreground/10 transition-colors outline-none focus-visible:ring-3"
            >
              <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 space-y-1">
                <Typography variant="h4" className="font-semibold">
                  {section.title}
                </Typography>
                <Typography variant="muted">{section.description}</Typography>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SettingsModules() {
  return (
    <div className="space-y-2">
      <FormSection
        title="Catalog"
        description="Manage currencies, exchange rates, and partner sarafis."
      >
        <ModuleList modules={CATALOG_MODULES} />
      </FormSection>
    </div>
  );
}
