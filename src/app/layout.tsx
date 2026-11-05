import type { Metadata } from "next";
import {
  Instrument_Sans,
  Source_Serif_4,
  JetBrains_Mono,
  Noto_Sans_Arabic,
} from "next/font/google";

import { ThemeProvider } from "@/design-system/theme-provider";
import { getDictionary } from "@/lib/i18n/dictionary";
import { getAppLocale } from "@/lib/i18n/get-app-locale";
import { localeDirection, localeHtmlLang } from "@/lib/i18n/locale";
import { LocaleProvider } from "@/lib/i18n/locale-provider";

import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans-face",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-heading-face",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-arabic-face",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Radefy Sarafi Offline",
  description: "Radefy Sarafi Offline",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getAppLocale();
  const dir = localeDirection(locale);
  const lang = localeHtmlLang(locale);
  const dictionary = getDictionary(locale);

  return (
    <html
      lang={lang}
      dir={dir}
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${notoSansArabic.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-0 flex-col font-sans">
        <ThemeProvider>
          <LocaleProvider locale={locale} dictionary={dictionary}>
            {children}
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
