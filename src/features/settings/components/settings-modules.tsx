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
    <ul className="grid gap-2 sm:grid-cols-2">
      {modules.map((section) => {
        const Icon = section.icon;

        return (
          <li key={section.href} className={section.href === "/partner-sarafi" ? "sm:col-span-2" : undefined}>
            <Link
              href={section.href}
              className="bg-muted/30 hover:bg-muted/55 focus-visible:ring-ring flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ring-foreground/8 transition-colors outline-none focus-visible:ring-3"
            >
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 space-y-0.5">
                <Typography variant="h4" className="text-sm font-semibold">
                  {section.title}
                </Typography>
                <Typography variant="muted" className="text-xs leading-snug">
                  {section.description}
                </Typography>
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
    <FormSection
      title="Catalog"
      description="Manage currencies, exchange rates, and partner sarafis."
      className="bg-card ring-foreground/10 gap-4 rounded-2xl p-4 shadow-sm ring-1"
    >
      <ModuleList modules={CATALOG_MODULES} />
    </FormSection>
  );
}
