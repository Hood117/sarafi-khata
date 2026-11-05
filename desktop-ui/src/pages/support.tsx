import { useEffect, useState, type MouseEvent } from "react";
import { Globe, Mail, MessageCircle } from "lucide-react";

import {
  getAppInfo,
  getLicenseStatus,
  openExternalUrl,
  type AppInfo,
  type LicenseStatus,
} from "@desktop/api";
import radefyBrandArt from "@desktop/assets/brand/radefy-brand-gradient.png";
import radefyWordmark from "@desktop/assets/brand/radefy-systems-wordmark.png";
import { useT } from "@desktop/i18n";
import {
  APP_COMPANY,
  APP_LICENSE_CONTACT,
  formatWhatsAppDisplay,
} from "@desktop/lib/app-developers";
import { openWhatsApp } from "@desktop/lib/whatsapp";

export function SupportPage() {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAppInfo(), getLicenseStatus()])
      .then(([appInfo, licenseStatus]) => {
        if (cancelled) return;
        setInfo(appInfo);
        setLicense(licenseStatus);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function handleExternal(event: MouseEvent<HTMLAnchorElement>) {
    if (!("__TAURI_INTERNALS__" in window)) return;
    event.preventDefault();
    void openExternalUrl(event.currentTarget.href).catch(() => undefined);
  }

  return (
    <div className="support-page workspace-page">
      <section className="support-brand-panel">
        <img
          className="support-brand-art"
          src={radefyBrandArt}
          alt=""
          aria-hidden
        />
        <div className="support-brand-content">
          <img
            className="support-simple-logo"
            src={radefyWordmark}
            alt={APP_COMPANY.name}
          />
          <div className="support-brand-copy">
            <h1>{t.pages.support}</h1>
            <p>{t.support.subtitle}</p>
          </div>
        </div>
      </section>

      <div className="support-simple-grid">
        <section className="support-simple-card">
          <h2>{t.support.contact}</h2>
          <p className="support-simple-name">{APP_LICENSE_CONTACT.name}</p>
          <p className="support-simple-text">{t.support.contactHint}</p>
          <button
            type="button"
            className="support-simple-wa"
            onClick={() =>
              void openWhatsApp(
                APP_LICENSE_CONTACT.whatsapp,
                `Hello ${APP_LICENSE_CONTACT.name}, I need help with Radefy Sarafi Offline.`,
              )
            }
          >
            <MessageCircle size={16} aria-hidden />
            <span dir="ltr">{formatWhatsAppDisplay(APP_LICENSE_CONTACT.whatsapp)}</span>
          </button>
        </section>

        <section className="support-simple-card">
          <h2>{t.support.company}</h2>
          <p className="support-simple-text">{t.support.companyBlurb}</p>
          <div className="support-simple-links">
            <a
              href={APP_COMPANY.url}
              target="_blank"
              rel="noreferrer"
              onClick={handleExternal}
            >
              <Globe size={15} aria-hidden />
              <span dir="ltr">{APP_COMPANY.websiteLabel}</span>
            </a>
            <a href={`mailto:${APP_COMPANY.email}`} onClick={handleExternal}>
              <Mail size={15} aria-hidden />
              <span dir="ltr">{APP_COMPANY.email}</span>
            </a>
          </div>
        </section>

        <section className="support-simple-card">
          <h2>{t.support.product}</h2>
          <p className="support-simple-text">{t.support.offlineNote}</p>
          <dl className="support-simple-meta">
            <div>
              <dt>{t.support.version}</dt>
              <dd dir="ltr">{info ? `v${info.version}` : "—"}</dd>
            </div>
            <div>
              <dt>{t.support.license}</dt>
              <dd>{license?.licensed ? t.support.licensed : t.support.notLicensed}</dd>
            </div>
            {license?.licensed && license.customerName ? (
              <div>
                <dt>{t.support.licensedTo}</dt>
                <dd>{license.customerName}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
