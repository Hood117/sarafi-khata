import { useCallback, useEffect, useState } from "react";

import {
  listPrinters,
  type PrinterInfo,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { errorMessage } from "@desktop/lib/app-error";
import {
  getPreferredPrinterName,
  setPreferredPrinterName,
} from "@desktop/lib/preferred-printer";

function connectionLabel(
  connection: string,
  t: ReturnType<typeof useT>,
): string {
  switch (connection) {
    case "usb":
      return t.settings.printerConnectionUsb;
    case "network":
      return t.settings.printerConnectionNetwork;
    case "file":
      return t.settings.printerConnectionFile;
    case "local":
      return t.settings.printerConnectionLocal;
    default:
      return t.settings.printerConnectionOther;
  }
}

function formFactorLabel(
  formFactor: string,
  t: ReturnType<typeof useT>,
): string {
  switch (formFactor) {
    case "thermal":
      return t.settings.printerFormThermal;
    case "a4":
      return t.settings.printerFormA4;
    case "mixed":
      return t.settings.printerFormMixed;
    default:
      return t.settings.printerFormUnknown;
  }
}

/**
 * Settings: pick Saraf's preferred Windows printer (used only by a future Print button).
 */
export function SettingsPrinterPanel() {
  const t = useT();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [unavailableName, setUnavailableName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const result = await listPrinters();
      const list = result.printers ?? [];
      setPrinters(list);

      const preferred = getPreferredPrinterName();
      const defaultName =
        result.defaultPrinter?.trim() ||
        list.find((p) => p.isDefault)?.name ||
        null;

      if (preferred) {
        const stillThere = list.some((p) => p.name === preferred);
        if (stillThere) {
          setSelectedName(preferred);
          setUnavailableName(null);
        } else {
          setSelectedName(null);
          setUnavailableName(preferred);
        }
        return;
      }

      // First visit: follow the Windows default when available.
      if (defaultName && list.some((p) => p.name === defaultName)) {
        setSelectedName(defaultName);
        setPreferredPrinterName(defaultName);
        setUnavailableName(null);
        return;
      }

      setSelectedName(null);
      setUnavailableName(null);
    } catch (err: unknown) {
      setPrinters([]);
      setSelectedName(null);
      setLoadError(errorMessage(err, t.settings.printerLoadError));
    } finally {
      setBusy(false);
    }
  }, [t.settings.printerLoadError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function selectPrinter(name: string) {
    setSelectedName(name);
    setPreferredPrinterName(name);
    setUnavailableName(null);
  }

  return (
    <div className="card settings-general-card settings-printer-card">
      <div className="settings-general-head settings-printer-head">
        <div>
          <h2>{t.settings.printer}</h2>
          <p className="muted">{t.settings.printerHint}</p>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? t.common.loading : t.settings.printerRefresh}
        </button>
      </div>

      {loadError ? <p className="error">{loadError}</p> : null}

      {unavailableName ? (
        <p className="error settings-printer-unavailable" role="alert">
          {t.settings.printerUnavailable.replace("{name}", unavailableName)}
        </p>
      ) : null}

      {!busy && !loadError && printers.length === 0 ? (
        <p className="muted settings-printer-empty">{t.settings.printerNone}</p>
      ) : null}

      {printers.length > 0 ? (
        <ul className="settings-printer-list" role="radiogroup" aria-label={t.settings.printer}>
          {printers.map((printer) => {
            const checked = selectedName === printer.name;
            return (
              <li key={printer.name}>
                <label
                  className={`settings-printer-item${checked ? " settings-printer-item--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="saraf-preferred-printer"
                    value={printer.name}
                    checked={checked}
                    disabled={busy}
                    onChange={() => selectPrinter(printer.name)}
                  />
                  <span className="settings-printer-item-body">
                    <span className="settings-printer-name">
                      {printer.name}
                      {printer.isDefault ? (
                        <span className="muted settings-printer-default-badge">
                          {t.settings.printerWindowsDefault}
                        </span>
                      ) : null}
                    </span>
                    <span className="muted settings-printer-meta">
                      {connectionLabel(printer.connection, t)}
                      {" · "}
                      {formFactorLabel(printer.formFactor, t)}
                      {printer.status && printer.status !== "Ready"
                        ? ` · ${printer.status}`
                        : ""}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
