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

function printerOptionLabel(printer: PrinterInfo, t: ReturnType<typeof useT>): string {
  const parts = [printer.name];
  if (printer.isDefault) {
    parts.push(`(${t.settings.printerWindowsDefault})`);
  }
  return parts.join(" ");
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
    if (!name) {
      setSelectedName(null);
      return;
    }
    setSelectedName(name);
    setPreferredPrinterName(name);
    setUnavailableName(null);
  }

  const selected = printers.find((p) => p.name === selectedName) ?? null;

  return (
    <div className="card settings-general-card settings-printer-card">
      <div className="settings-general-head settings-printer-head">
        <div>
          <h2>{t.settings.printer}</h2>
          <p className="muted">{t.settings.printerHint}</p>
        </div>
        <button
          type="button"
          className="btn secondary settings-printer-refresh"
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
        <div className="settings-printer-prefs">
          <label className="settings-general-field settings-printer-field">
            <span>{t.settings.printer}</span>
            <select
              className="settings-general-select settings-printer-select"
              value={selectedName ?? ""}
              disabled={busy}
              aria-label={t.settings.printer}
              onChange={(e) => selectPrinter(e.target.value)}
            >
              {!selectedName ? (
                <option value="">{t.common.selectOption}</option>
              ) : null}
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printerOptionLabel(printer, t)}
                </option>
              ))}
            </select>
          </label>

          {selected ? (
            <p className="muted settings-printer-meta-line">
              {connectionLabel(selected.connection, t)}
              {" · "}
              {formFactorLabel(selected.formFactor, t)}
              {selected.status && selected.status !== "Ready"
                ? ` · ${selected.status}`
                : ""}
              {selected.isDefault
                ? ` · ${t.settings.printerWindowsDefault}`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
