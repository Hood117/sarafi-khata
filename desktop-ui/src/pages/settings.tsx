import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";

import {
  clearUserFingerprint,
  createCurrency,
  createDbBackup,
  createUser,
  deleteUser,
  enrollUserFingerprint,
  getAdminAuthPinStatus,
  getBusinessName,
  listCurrenciesPage,
  listDbBackups,
  listDeskScreens,
  listUsers,
  pickBackupFile,
  resetUserPassword,
  restoreDbBackup,
  restoreDbBackupFromFile,
  setAdminAuthPin,
  setBusinessName,
  resetBusinessData,
  updateCurrency,
  updateUser,
  validateBackupFile,
  verifyAdminPassword,
  type BackupListItem,
  type CurrencyListItem,
  type DeskScreenOption,
  type FingerprintEnrollProgress,
  type UserAccount,
} from "@desktop/api";
import {
  pauseFingerprintIdentify,
  resumeFingerprintIdentify,
} from "@desktop/lib/fingerprint-identify-gate";
import {
  isUnmatchedFingerprint,
  notifyWrongFingerprint,
  playFingerprintSound,
} from "@desktop/lib/fingerprint-sounds";
import {
  AdminPasswordConfirmModal,
  AuthPinSetupModal,
} from "@desktop/components/authorization-pin-modal";
import { SettingsPrinterPanel } from "@desktop/components/settings-printer-panel";
import { clearVaultUnlockSession } from "@desktop/components/vault-unlock-gate";
import {
  FingerprintScanStage,
  type FingerprintScanStatus,
} from "@desktop/components/fingerprint-scan-stage";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { canAccessScreen, isAdminRole, isSystemAdminUsername } from "@desktop/lib/permissions";
import { useDeskAction } from "@desktop/lib/use-desk-action";
import {
  UI_FONT_SIZES,
  useUiTextPrefs,
  type UiFontSize,
  type UiTheme,
} from "@desktop/ui-text-prefs";
import { Modal } from "@desktop/ui/modal";
import { ModalErrorBanner } from "@desktop/ui/modal-error-banner";
import { Pagination } from "@desktop/ui/pagination";
import { useSuccessModal } from "@desktop/ui/use-success-modal";
import { formatBytes } from "@desktop/lib/datetime";
import {
  errorMessage,
  logAppError,
  technicalErrorText,
  userFacingError,
} from "@desktop/lib/app-error";
import {
  currencySearchHaystack,
  localizedCurrencyName,
} from "@desktop/lib/currency-labels";
import { searchWorldCurrencies, type WorldCurrency } from "@desktop/lib/world-currencies";
import { CurrencyCodeWithFlag, CurrencyFlag } from "@desktop/ui/currency-flag";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";
import type { Dictionary } from "@/lib/i18n/dictionary";

type SettingsTab = "general" | "currencies" | "users" | "backup" | "database";

type CurrencyPanel = "system" | "world";

function parseSettingsTab(raw: string | null): SettingsTab {
  if (
    raw === "currencies" ||
    raw === "users" ||
    raw === "backup" ||
    raw === "database" ||
    raw === "general"
  ) {
    return raw;
  }
  return "general";
}

const ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const;

type ScreenAccessLevel = "read" | "write";

function defaultScreenRightsForRole(
  role: string,
  screens: DeskScreenOption[],
): Record<string, ScreenAccessLevel> {
  const ids =
    role === "ADMIN"
      ? screens.map((s) => s.id)
      : role === "MANAGER"
        ? screens.map((s) => s.id).filter((id) => id !== "backup")
        : screens
            .map((s) => s.id)
            .filter((id) =>
              [
                "dashboard",
                "cash",
                "vaults",
                "customers",
                "debtorsCreditors",
                "hawala",
                "daybook",
                "transactions",
              ].includes(id),
            );
  const out: Record<string, ScreenAccessLevel> = {};
  for (const id of ids) out[id] = "write";
  return out;
}

function rightsFromUser(user: UserAccount | null, screens: DeskScreenOption[]): Record<string, ScreenAccessLevel> {
  if (!user) return defaultScreenRightsForRole("CASHIER", screens);
  if (user.screenRights && Object.keys(user.screenRights).length > 0) {
    const out: Record<string, ScreenAccessLevel> = {};
    for (const [id, access] of Object.entries(user.screenRights)) {
      out[id] = access === "read" ? "read" : "write";
    }
    return out;
  }
  if (user.allowedScreens?.length) {
    const out: Record<string, ScreenAccessLevel> = {};
    for (const id of user.allowedScreens) out[id] = "write";
    return out;
  }
  return defaultScreenRightsForRole(user.role, screens);
}

function fileRestoreUserError(err: unknown, t: Dictionary): string {
  logAppError("restore-from-file", err);
  const raw = technicalErrorText(err);
  if (/BACKUP_FILE_INVALID/i.test(raw)) return t.backup.restoreFromFileInvalid;
  if (/BACKUP_FILE_INCOMPATIBLE/i.test(raw)) return t.backup.restoreFromFileIncompatible;
  if (/BACKUP_FILE_DAMAGED/i.test(raw)) return t.backup.restoreFromFileDamaged;
  if (/BACKUP_FILE_SAFETY_FAILED/i.test(raw)) return t.backup.restoreFromFileSafetyFailed;
  if (/BACKUP_FILE_VERIFY_FAILED/i.test(raw)) return t.backup.restoreFromFileVerifyFailed;
  if (/BACKUP_FILE_LIVE_DB/i.test(raw)) return t.backup.restoreFromFileLiveDb;
  if (/BACKUP_FILE_RESTORE_FAILED/i.test(raw)) return t.backup.restoreFromFileFailed;
  return userFacingError(err, t.backup.restoreFromFileFailed, t.errors);
}

export function SettingsPage() {
  const t = useT();
  const localeLabels: Record<AppLocale, string> = {
    en: t.settings.languageEnglish,
    fa: t.settings.languageDari,
    ps: t.settings.languagePashto,
  };
  const { session, logout } = useAuth();
  const { locale, setLocale } = useLocale();
  const {
    fontSize,
    boldText,
    theme,
    setFontSize,
    setBoldText,
    setTheme,
  } = useUiTextPrefs();
  const { showSuccess, successModal } = useSuccessModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSettingsTab(searchParams.get("tab"));

  const selectTab = useCallback(
    (next: SettingsTab) => {
      setSearchParams(next === "general" ? {} : { tab: next }, { replace: true });
    },
    [setSearchParams],
  );

  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [businessNameBusy, setBusinessNameBusy] = useState(false);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [currenciesTotal, setCurrenciesTotal] = useState(0);
  const [currenciesPage, setCurrenciesPage] = useState(1);
  const currenciesPageSize = 25;
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [screens, setScreens] = useState<DeskScreenOption[]>([]);

  const [busy, setBusy] = useState(false);
  const [fileRestorePhase, setFileRestorePhase] = useState<"validate" | "restore" | null>(null);
  const [fileRestoreAlert, setFileRestoreAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [localeBusy, setLocaleBusy] = useState(false);
  const [textPrefsBusy, setTextPrefsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetTyped, setResetTyped] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [worldSearch, setWorldSearch] = useState("");
  const [worldPage, setWorldPage] = useState(1);
  const worldPageSize = 25;
  const [currencyPanel, setCurrencyPanel] = useState<CurrencyPanel>("system");
  const [activeCurrencyCodes, setActiveCurrencyCodes] = useState<
    Record<string, true>
  >({});
  const [inactiveByCode, setInactiveByCode] = useState<
    Record<string, CurrencyListItem>
  >({});
  /** Multi-select for catalog (active) currencies — keyed by id. */
  const [selectedCatalog, setSelectedCatalog] = useState<
    Record<string, CurrencyListItem>
  >({});
  /** Multi-select for world currencies to add — keyed by code. */
  const [selectedWorld, setSelectedWorld] = useState<Record<string, WorldCurrency>>(
    {},
  );

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserAccount | null>(null);
  const [fingerprintUser, setFingerprintUser] = useState<UserAccount | null>(null);

  const canManageUsers = isAdminRole(session) && canAccessScreen(session, "settings");
  const canManageBackup = canManageUsers;
  const canResetDatabase = canManageUsers;

  useEffect(() => {
    if (tab === "users" && !canManageUsers) selectTab("general");
    if (tab === "backup" && !canManageBackup) selectTab("general");
    if (tab === "database" && !canResetDatabase) selectTab("general");
  }, [tab, canManageUsers, canManageBackup, canResetDatabase, selectTab]);

  const refreshBackups = useCallback(() => {
    void listDbBackups()
      .then(setBackups)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const refreshCurrencies = useCallback(() => {
    void Promise.all([
      listCurrenciesPage({
        activeOnly: true,
        page: currenciesPage,
        pageSize: currenciesPageSize,
      }),
      listCurrenciesPage({
        activeOnly: false,
        page: 1,
        pageSize: 500,
      }),
    ])
      .then(([activePage, allPage]) => {
        setCurrencies(activePage.items);
        setCurrenciesTotal(activePage.total);
        const activeCodes: Record<string, true> = {};
        const inactiveMap: Record<string, CurrencyListItem> = {};
        for (const row of allPage.items) {
          const code = row.code?.trim().toUpperCase();
          if (!code) continue;
          if (row.isActive) activeCodes[code] = true;
          else inactiveMap[code] = row;
        }
        setActiveCurrencyCodes(activeCodes);
        setInactiveByCode(inactiveMap);
      })
      .catch((err: unknown) => {
        setCurrencyError(err instanceof Error ? err.message : String(err));
      });
  }, [currenciesPage]);

  const refreshUsers = useCallback(() => {
    if (!canManageUsers) {
      setUsers([]);
      return;
    }
    void Promise.all([listUsers(), listDeskScreens()])
      .then(([list, deskScreens]) => {
        setUsers(list);
        setScreens(deskScreens);
      })
      .catch((err: unknown) => {
        setUserError(err instanceof Error ? err.message : String(err));
      });
  }, [canManageUsers]);

  const refreshActiveTab = useCallback(() => {
    if (tab === "currencies") {
      refreshCurrencies();
      return;
    }
    if (tab === "users") {
      refreshUsers();
      return;
    }
    if (tab === "backup") {
      refreshBackups();
      return;
    }
    void getBusinessName()
      .then((row) => setBusinessNameDraft(row.businessName))
      .catch(() => undefined);
  }, [tab, refreshCurrencies, refreshUsers, refreshBackups]);

  useDeskAction("refresh", refreshActiveTab);

  useEffect(() => {
    void getBusinessName()
      .then((row) => setBusinessNameDraft(row.businessName))
      .catch(() => undefined);
    refreshBackups();
    refreshCurrencies();
    refreshUsers();
  }, [refreshBackups, refreshCurrencies, refreshUsers]);

  async function handleSaveBusinessName() {
    setBusinessNameBusy(true);
    setError(null);
    try {
      const saved = await setBusinessName(businessNameDraft);
      setBusinessNameDraft(saved.businessName);
      showSuccess(t.common.success);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusinessNameBusy(false);
    }
  }

  async function handleLocaleChange(next: AppLocale) {
    if (next === locale) return;
    setLocaleBusy(true);
    setError(null);
    try {
      await setLocale(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocaleBusy(false);
    }
  }

  async function handleFontSizeChange(next: UiFontSize) {
    if (next === fontSize) return;
    setTextPrefsBusy(true);
    setError(null);
    try {
      await setFontSize(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTextPrefsBusy(false);
    }
  }

  async function handleBoldTextChange(next: boolean) {
    if (next === boldText) return;
    setTextPrefsBusy(true);
    setError(null);
    try {
      await setBoldText(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTextPrefsBusy(false);
    }
  }

  async function handleThemeChange(next: UiTheme) {
    if (next === theme) return;
    setTextPrefsBusy(true);
    setError(null);
    try {
      await setTheme(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTextPrefsBusy(false);
    }
  }

  async function handleBackup() {
    setBusy(true);
    setError(null);
    try {
      const result = await createDbBackup("manual");
      showSuccess(t.common.success);
      if (result.warnings.length) {
        setError(result.warnings.join(" · "));
      }
      refreshBackups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetBusinessData() {
    if (resetTyped !== "RESET") return;
    if (!window.confirm(t.settings.resetFinalConfirm)) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await resetBusinessData("RESET");
      setShowResetModal(false);
      setResetTyped("");
      await logout();
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetBusy(false);
    }
  }

  async function handleRestore(stamp: string) {
    const title = t.backup.restoreConfirmTitle.replace("{stamp}", stamp);
    const body = t.backup.restoreConfirmBody;
    if (!window.confirm(`${title}\n\n${body}`)) {
      return;
    }
    setBusy(true);
    setError(null);
    // Let React paint the busy state before the restore IPC starts.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 40);
    });
    try {
      const result = await restoreDbBackup(stamp, session?.token);
      showSuccess(result.message || t.backup.restoreDone);
      refreshBackups();
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function handleRestoreFromFile() {
    setError(null);
    setFileRestoreAlert(null);
    let picked: string | null;
    try {
      picked = await pickBackupFile();
    } catch (err: unknown) {
      setError(fileRestoreUserError(err, t));
      return;
    }
    if (!picked) {
      return;
    }

    setBusy(true);
    setFileRestorePhase("validate");
    let info;
    try {
      info = await validateBackupFile(picked);
    } catch (err: unknown) {
      const message = fileRestoreUserError(err, t);
      setBusy(false);
      setFileRestorePhase(null);
      const raw = technicalErrorText(err);
      if (/BACKUP_FILE_INCOMPATIBLE/i.test(raw)) {
        setFileRestoreAlert({
          title: t.backup.restoreFromFileIncompatibleTitle,
          message,
        });
        return;
      }
      if (/BACKUP_FILE_INVALID|BACKUP_FILE_DAMAGED|BACKUP_FILE_LIVE_DB/i.test(raw)) {
        setFileRestoreAlert({
          title: t.backup.restoreFromFileInvalidTitle,
          message,
        });
        return;
      }
      setError(message);
      return;
    }
    setBusy(false);
    setFileRestorePhase(null);

    const title = t.backup.restoreFromFileConfirmTitle;
    const body = t.backup.restoreFromFileConfirmBody.replace("{path}", info.path);
    if (!window.confirm(`${title}\n\n${body}`)) {
      return;
    }

    setBusy(true);
    setFileRestorePhase("restore");
    setError(null);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 40);
    });
    try {
      const result = await restoreDbBackupFromFile(info.path, session?.token);
      showSuccess(result.message || t.backup.restoreDone);
      refreshBackups();
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err: unknown) {
      setError(fileRestoreUserError(err, t));
      setBusy(false);
      setFileRestorePhase(null);
    }
  }

  function clearCurrencySelection() {
    setSelectedCatalog({});
    setSelectedWorld({});
  }

  function toggleCatalogSelected(row: CurrencyListItem) {
    setSelectedCatalog((prev) => {
      const next = { ...prev };
      if (next[row.id]) delete next[row.id];
      else next[row.id] = row;
      return next;
    });
  }

  function toggleWorldSelected(row: WorldCurrency) {
    const code = (row.code || "").trim().toUpperCase();
    if (!code || activeCurrencyCodes[code]) return;
    setSelectedWorld((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code];
      else next[code] = { ...row, code };
      return next;
    });
  }

  function setCatalogPageSelected(select: boolean) {
    setSelectedCatalog((prev) => {
      const next = { ...prev };
      for (const row of currencies) {
        if (select) next[row.id] = row;
        else delete next[row.id];
      }
      return next;
    });
  }

  function setWorldPageSelected(rows: WorldCurrency[], select: boolean) {
    setSelectedWorld((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        const code = (row.code || "").trim().toUpperCase();
        if (!code || activeCurrencyCodes[code]) continue;
        if (select) next[code] = { ...row, code };
        else delete next[code];
      }
      return next;
    });
  }

  async function activateWorldCurrency(row: WorldCurrency) {
    const code = row.code.toUpperCase();
    if (activeCurrencyCodes[code]) return;
    const inactive = inactiveByCode[code];
    if (inactive) {
      await updateCurrency({
        id: inactive.id,
        name: inactive.name,
        symbol: inactive.symbol,
        decimalPlaces: inactive.decimalPlaces,
        isActive: true,
      });
    } else {
      await createCurrency({
        code: row.code,
        name: row.name,
        symbol: row.symbol || null,
        decimalPlaces: row.decimalPlaces,
        isActive: true,
      });
    }
  }

  async function handleAddWorldCurrency(row: WorldCurrency) {
    const code = row.code.toUpperCase();
    if (activeCurrencyCodes[code]) return;
    setCurrencyBusy(true);
    setCurrencyError(null);
    try {
      await activateWorldCurrency(row);
      showSuccess(t.common.success);
      clearCurrencySelection();
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function handleAddSelectedWorldCurrencies() {
    const rows = Object.values(selectedWorld).filter(
      (row) => !activeCurrencyCodes[(row.code || "").trim().toUpperCase()],
    );
    if (rows.length === 0) return;
    setCurrencyBusy(true);
    setCurrencyError(null);
    try {
      for (const row of rows) {
        await activateWorldCurrency(row);
      }
      showSuccess(t.common.success);
      clearCurrencySelection();
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
      refreshCurrencies();
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function toggleCurrencyActive(row: CurrencyListItem) {
    if (!row.isActive) return;
    setCurrencyBusy(true);
    setCurrencyError(null);
    try {
      await updateCurrency({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        decimalPlaces: row.decimalPlaces,
        isActive: false,
      });
      showSuccess(t.common.deactivate);
      clearCurrencySelection();
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function handleDeactivateSelectedCurrencies() {
    const rows = Object.values(selectedCatalog).filter((row) => row.isActive);
    if (rows.length === 0) return;
    setCurrencyBusy(true);
    setCurrencyError(null);
    try {
      for (const row of rows) {
        await updateCurrency({
          id: row.id,
          name: row.name,
          symbol: row.symbol,
          decimalPlaces: row.decimalPlaces,
          isActive: false,
        });
      }
      showSuccess(t.common.deactivate);
      clearCurrencySelection();
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
      refreshCurrencies();
    } finally {
      setCurrencyBusy(false);
    }
  }

  const worldRows = useMemo(() => {
    const base = searchWorldCurrencies(worldSearch, locale);
    const q = worldSearch.trim().toLowerCase();
    const seen = new Set(
      base.map((c) => (c.code || "").trim().toUpperCase()).filter(Boolean),
    );
    const extras: WorldCurrency[] = [];
    for (const row of Object.values(inactiveByCode)) {
      const code = (row.code || "").trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      if (q) {
        const hay = currencySearchHaystack(row, locale);
        if (!hay.includes(q)) continue;
      }
      extras.push({
        code,
        name: row.name,
        symbol: row.symbol ?? "",
        decimalPlaces: row.decimalPlaces,
      });
    }
    extras.sort((a, b) => a.code.localeCompare(b.code));
    return [...base, ...extras];
  }, [worldSearch, inactiveByCode, locale]);

  const worldPageRows = useMemo(() => {
    const start = (worldPage - 1) * worldPageSize;
    return worldRows.slice(start, start + worldPageSize);
  }, [worldRows, worldPage, worldPageSize]);

  return (
    <div className="stack page-column settings-page workspace-page">
      {tab === "general" ? (
        <div className="stack settings-general-compact">
          {error ? <p className="error">{error}</p> : null}

          <div className="card settings-general-card">
            <div className="settings-general-head">
              <h2>{t.settings.shopPreferences}</h2>
              <p className="muted">{t.settings.languageHint}</p>
            </div>

            <div className="settings-general-prefs" role="group" aria-label={t.settings.shopPreferences}>
              <label className="settings-general-field">
                <span>{t.settings.language}</span>
                <select
                  className="settings-general-select"
                  value={locale}
                  disabled={localeBusy}
                  onChange={(e) => void handleLocaleChange(e.target.value as AppLocale)}
                >
                  {APP_LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {localeLabels[code]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-general-field">
                <span>{t.settings.textSize}</span>
                <select
                  className="settings-general-select"
                  value={fontSize}
                  disabled={textPrefsBusy}
                  onChange={(e) => void handleFontSizeChange(e.target.value as UiFontSize)}
                >
                  {UI_FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size === "small"
                        ? t.settings.textSizeSmall
                        : size === "default"
                          ? t.settings.textSizeDefault
                          : size === "large"
                            ? t.settings.textSizeLarge
                            : t.settings.textSizeExtraLarge}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-general-field">
                <span>{t.settings.appearance}</span>
                <select
                  className="settings-general-select"
                  value={theme}
                  disabled={textPrefsBusy}
                  onChange={(e) => void handleThemeChange(e.target.value as UiTheme)}
                >
                  <option value="light">{t.settings.themeLight}</option>
                  <option value="dark">{t.settings.themeDark}</option>
                </select>
              </label>

              <label className="settings-general-field">
                <span>{t.settings.boldText}</span>
                <select
                  className="settings-general-select"
                  value={boldText ? "on" : "off"}
                  disabled={textPrefsBusy}
                  title={t.settings.boldTextHint}
                  onChange={(e) => void handleBoldTextChange(e.target.value === "on")}
                >
                  <option value="off">{t.common.no}</option>
                  <option value="on">{t.common.yes}</option>
                </select>
              </label>
            </div>

            <form
              className="settings-general-business"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSaveBusinessName();
              }}
            >
              <label className="settings-general-field settings-general-field--grow">
                <span>{t.settings.businessName}</span>
                <input
                  value={businessNameDraft}
                  maxLength={120}
                  required
                  disabled={businessNameBusy}
                  onChange={(e) => setBusinessNameDraft(e.target.value)}
                />
              </label>
              <button type="submit" disabled={businessNameBusy || !businessNameDraft.trim()}>
                {businessNameBusy ? t.common.loading : t.common.save}
              </button>
            </form>
          </div>

          <SettingsPrinterPanel />

          <div className="card settings-general-card">
            <div className="settings-general-head">
              <h2>{t.settings.keyboardShortcuts}</h2>
              <p className="muted">{t.settings.keyboardShortcutsHint}</p>
            </div>
            <ul className="shortcut-list shortcut-list-compact">
              {(
                [
                  { keys: ["Ctrl", "D"], action: t.settings.shortcutDeposit },
                  { keys: ["Ctrl", "W"], action: t.settings.shortcutWithdraw },
                  { keys: ["Ctrl", "T"], action: t.settings.shortcutTransfer },
                  { keys: ["Ctrl", "E"], action: t.settings.shortcutExchange },
                  { keys: ["Ctrl", "H"], action: t.settings.shortcutSendHawala },
                  { keys: ["Ctrl", "R"], action: t.settings.shortcutReceiveHawala },
                  { keys: ["Ctrl", "C"], action: t.settings.shortcutAddCustomer },
                  { keys: ["Ctrl", "O"], action: t.settings.shortcutOk },
                  { keys: ["Ctrl", "S"], action: t.settings.shortcutSave },
                  { keys: ["Ctrl", "U"], action: t.settings.shortcutUndo },
                  { keys: ["Ctrl", "P"], action: t.settings.shortcutPrint },
                  { keys: ["Ctrl", "F"], action: t.settings.shortcutSearch },
                  { keys: ["Ctrl", "N"], action: t.settings.shortcutNew },
                  { keys: ["F5"], action: t.settings.shortcutRefresh },
                  { keys: ["Esc"], action: t.settings.shortcutEsc },
                  { keys: ["↑", "↓"], action: t.settings.shortcutNavigateResults },
                  { keys: ["←", "→"], action: t.settings.shortcutNavigateTabs },
                ] as const
              ).map((row) => (
                <li key={row.keys.join("-")} className="shortcut-row">
                  <span className="shortcut-action">{row.action}</span>
                  <span className="shortcut-keys" aria-label={row.keys.join(" + ")}>
                    {row.keys.map((key, i) => (
                      <span key={`${row.action}-${key}`}>
                        {i > 0 ? <span className="shortcut-sep">+</span> : null}
                        <kbd className="shortcut-key">{key}</kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "currencies" ? (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.pages.currencies}</h2>
          </div>

          <div
            className="settings-tabs currency-panel-tabs"
            role="tablist"
            aria-label={t.pages.currencies}
          >
            <button
              type="button"
              role="tab"
              aria-selected={currencyPanel === "system"}
              className={`settings-tab${currencyPanel === "system" ? " active" : ""}`}
              onClick={() => {
                setCurrencyPanel("system");
                clearCurrencySelection();
              }}
            >
              {t.settings.catalog}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currencyPanel === "world"}
              className={`settings-tab${currencyPanel === "world" ? " active" : ""}`}
              onClick={() => {
                setCurrencyPanel("world");
                setWorldPage(1);
                clearCurrencySelection();
              }}
            >
              {t.currencies.worldCatalog}
            </button>
          </div>

          <ModalErrorBanner message={currencyError} />

          {currencyPanel === "system" ? (
            <>
              {Object.keys(selectedCatalog).length > 0 ? (
                <div className="currency-bulk-bar row" role="status">
                  <span className="muted">
                    {t.currencies.selectedCount.replace(
                      "{count}",
                      String(Object.keys(selectedCatalog).length),
                    )}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={currencyBusy}
                    onClick={clearCurrencySelection}
                  >
                    {t.currencies.clearSelection}
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={currencyBusy}
                    onClick={() => void handleDeactivateSelectedCurrencies()}
                  >
                    {t.currencies.deactivateSelected}
                  </button>
                </div>
              ) : null}
              <table className="currency-select-table">
                <thead>
                  <tr>
                    <th className="currency-select-cell" aria-label={t.currencies.selectAll}>
                      <input
                        type="checkbox"
                        checked={
                          currencies.length > 0 &&
                          currencies.every((row) => Boolean(selectedCatalog[row.id]))
                        }
                        disabled={currencyBusy || currencies.length === 0}
                        onChange={(e) => setCatalogPageSelected(e.target.checked)}
                        aria-label={t.currencies.selectAll}
                      />
                    </th>
                    <th>{t.currencies.code}</th>
                    <th>{t.common.name}</th>
                    <th>{t.currencies.symbol}</th>
                    <th>{t.currencies.decimals}</th>
                    <th>{t.common.status}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {currencies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        {t.currencies.emptyTitle}
                      </td>
                    </tr>
                  ) : (
                    currencies.map((row) => {
                      const selected = Boolean(selectedCatalog[row.id]);
                      return (
                        <tr
                          key={row.id}
                          className={selected ? "is-selected" : undefined}
                          onClick={() => toggleCatalogSelected(row)}
                        >
                          <td className="currency-select-cell">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={currencyBusy}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleCatalogSelected(row)}
                              aria-label={row.code}
                            />
                          </td>
                          <td>
                            <CurrencyCodeWithFlag code={row.code} />
                          </td>
                          <td>{localizedCurrencyName(row.code, locale, row.name)}</td>
                          <td>{row.symbol ?? "—"}</td>
                          <td>{row.decimalPlaces}</td>
                          <td>
                            <span className="badge badge-ok">{t.common.active}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
                              disabled={currencyBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleCurrencyActive(row);
                              }}
                            >
                              {t.common.deactivate}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <Pagination
                page={currenciesPage}
                pageSize={currenciesPageSize}
                total={currenciesTotal}
                busy={currencyBusy}
                onPageChange={setCurrenciesPage}
              />
            </>
          ) : (
            <div className="stack" style={{ gap: "0.45rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.98rem" }}>{t.currencies.worldCatalog}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {t.currencies.worldCatalogHint}
              </p>
              <label>
                {t.common.search}
                <input
                  value={worldSearch}
                  placeholder={t.currencies.searchWorld}
                  onChange={(e) => {
                    setWorldSearch(e.target.value);
                    setWorldPage(1);
                    setSelectedWorld({});
                  }}
                />
              </label>
              {(() => {
                const selectedCount = Object.keys(selectedWorld).length;
                const selectablePage = worldPageRows.filter((row) => {
                  const code = (row.code || "").trim().toUpperCase();
                  return code && !activeCurrencyCodes[code];
                });
                const allPageSelected =
                  selectablePage.length > 0 &&
                  selectablePage.every((row) =>
                    Boolean(selectedWorld[(row.code || "").trim().toUpperCase()]),
                  );
                return (
                  <div className="currency-bulk-bar row" role="status">
                    {selectedCount > 0 ? (
                      <>
                        <span className="muted">
                          {t.currencies.selectedCount.replace(
                            "{count}",
                            String(selectedCount),
                          )}
                        </span>
                        <button
                          type="button"
                          className="secondary"
                          disabled={currencyBusy}
                          onClick={clearCurrencySelection}
                        >
                          {t.currencies.clearSelection}
                        </button>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={currencyBusy}
                          onClick={() => void handleAddSelectedWorldCurrencies()}
                        >
                          {t.currencies.addSelected}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="muted">{t.currencies.selectAll}</span>
                        <label className="currency-select-all">
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            disabled={currencyBusy || selectablePage.length === 0}
                            onChange={(e) =>
                              setWorldPageSelected(worldPageRows, e.target.checked)
                            }
                            aria-label={t.currencies.selectAll}
                          />
                        </label>
                      </>
                    )}
                  </div>
                );
              })()}
              <div className="world-currency-list" role="list">
                {worldPageRows.length === 0 ? (
                  <p className="muted" style={{ margin: "0.75rem" }}>
                    {t.common.noResults}
                  </p>
                ) : (
                  worldPageRows.map((row) => {
                    const code = (row.code || "").trim().toUpperCase();
                    const inSystem = Boolean(activeCurrencyCodes[code]);
                    const selected = Boolean(selectedWorld[code]);
                    return (
                      <div
                        key={code || row.name}
                        className={[
                          "world-currency-row",
                          selected ? "is-selected" : "",
                          inSystem ? "is-disabled" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        role="listitem"
                        onClick={() => {
                          if (!inSystem) toggleWorldSelected(row);
                        }}
                      >
                        <label className="currency-select-cell" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={currencyBusy || inSystem}
                            onChange={() => toggleWorldSelected(row)}
                            aria-label={code}
                          />
                        </label>
                        <CurrencyFlag code={code} size="md" />
                        <div className="world-currency-meta">
                          <strong>
                            {code}
                            {row.symbol ? ` · ${row.symbol}` : ""}
                          </strong>
                          <span className="muted">
                            {localizedCurrencyName(code, locale, row.name)}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          {row.decimalPlaces} {t.currencies.decimals}
                        </span>
                        {inSystem ? (
                          <span className="badge badge-ok">{t.currencies.alreadyInSystem}</span>
                        ) : (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={currencyBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleAddWorldCurrency(row);
                            }}
                          >
                            {t.currencies.addToSystem}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <Pagination
                page={worldPage}
                pageSize={worldPageSize}
                total={worldRows.length}
                busy={currencyBusy}
                onPageChange={setWorldPage}
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.users}</h2>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setEditingUser(null);
                setShowUserForm(true);
                setUserError(null);
              }}
            >
              {t.common.create}
            </button>
          </div>

          {userError && !showUserForm && !passwordUser && !fingerprintUser ? (
            <ModalErrorBanner message={userError} />
          ) : null}

          <table>
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.users.username}</th>
                <th>{t.users.role}</th>
                <th>{t.users.screenRights}</th>
                <th>{t.common.status}</th>
                <th>{t.users.fingerprintTitle}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {t.users.emptyTitle}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.fullName}</strong>
                    </td>
                    <td>
                      <span className="ltr-text username">{user.username}</span>
                    </td>
                    <td>{user.role}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {isSystemAdminUsername(user.username) ||
                      (user.allowedScreens.length === 0 &&
                        Object.keys(user.screenRights ?? {}).length === 0)
                        ? t.common.all
                        : Object.entries(user.screenRights ?? {}).length > 0
                          ? Object.entries(user.screenRights)
                              .map(([id, access]) => `${id}:${access}`)
                              .slice(0, 4)
                              .join(", ") +
                            (Object.keys(user.screenRights).length > 4 ? "…" : "")
                          : `${user.allowedScreens.length}`}
                    </td>
                    <td>
                      {user.isActive ? (
                        <span className="badge badge-ok">{t.common.active}</span>
                      ) : (
                        <span className="badge">{t.common.inactive}</span>
                      )}
                    </td>
                    <td>
                      {user.fingerprintEnrolled ? (
                        <span className="badge badge-ok">{t.users.fingerprintEnrolled}</span>
                      ) : (
                        <span className="muted">{t.users.fingerprintNotEnrolled}</span>
                      )}
                    </td>
                    <td>
                      <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          disabled={userBusy}
                          onClick={() => {
                            setEditingUser(user);
                            setShowUserForm(true);
                            setUserError(null);
                          }}
                        >
                          {t.common.edit}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={userBusy}
                          onClick={() => {
                            setPasswordUser(user);
                            setUserError(null);
                          }}
                        >
                          {t.users.password}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={userBusy}
                          onClick={() => {
                            setFingerprintUser(user);
                            setUserError(null);
                          }}
                        >
                          {user.fingerprintEnrolled
                            ? t.users.fingerprintEdit
                            : t.users.fingerprintEnroll}
                        </button>
                        {!isSystemAdminUsername(user.username) &&
                        user.id !== session?.userId ? (
                          <button
                            type="button"
                            className="secondary danger"
                            disabled={userBusy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  t.users.deleteConfirm.replace(
                                    "{name}",
                                    user.fullName || user.username,
                                  ),
                                )
                              ) {
                                return;
                              }
                              setUserBusy(true);
                              setUserError(null);
                              void deleteUser(user.id)
                                .then(() => {
                                  showSuccess(t.common.success);
                                  return refreshUsers();
                                })
                                .catch((err: unknown) => {
                                  setUserError(
                                    err instanceof Error ? err.message : String(err),
                                  );
                                })
                                .finally(() => setUserBusy(false));
                            }}
                          >
                            {t.common.delete}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "backup" ? (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.backup}</h2>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void handleRestoreFromFile()}
              >
                {t.backup.restoreFromFile}
              </button>
              <button type="button" disabled={busy} onClick={() => void handleBackup()}>
                {busy ? t.backup.inProgress : t.backup.createBackup}
              </button>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {t.backup.hint}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {t.backup.restoreFromFileHint}
          </p>
          {busy ? (
            <p className="muted" style={{ margin: 0, fontWeight: 600 }}>
              {fileRestorePhase === "validate"
                ? t.backup.restoreFromFileValidating
                : t.backup.restoreRestarting}
            </p>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <table>
            <thead>
              <tr>
                <th>{t.backup.backupColumn}</th>
                <th>{t.common.size}</th>
                <th>{t.common.notes}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    {t.backup.noBackupsYet}
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.stamp}>
                    <td>{b.stamp}</td>
                    <td>{formatBytes(b.sizeBytes)}</td>
                    <td>{b.reason ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => void handleRestore(b.stamp)}
                      >
                        {t.backup.restore}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "database" && canResetDatabase ? (
        <div className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.database}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.settings.resetBusinessDataHint}
          </p>
          <div>
            <button
              type="button"
              className="secondary danger"
              disabled={resetBusy}
              onClick={() => {
                setResetTyped("");
                setResetError(null);
                setShowResetModal(true);
              }}
            >
              {t.settings.resetBusinessData}
            </button>
          </div>
        </div>
      ) : null}

      {showUserForm ? (
        <UserFormModal
          screens={screens}
          initial={editingUser}
          busy={userBusy}
          error={userError}
          actorUserId={session?.userId}
          onClose={() => {
            setShowUserForm(false);
            setEditingUser(null);
          }}
          onBusy={setUserBusy}
          onError={setUserError}
          onSaved={(msg) => {
            showSuccess(msg);
            refreshUsers();
          }}
          onDone={() => {
            setShowUserForm(false);
            setEditingUser(null);
            refreshUsers();
          }}
        />
      ) : null}

      {passwordUser ? (
        <PasswordModal
          user={passwordUser}
          busy={userBusy}
          error={userError}
          onClose={() => setPasswordUser(null)}
          onBusy={setUserBusy}
          onError={setUserError}
          onOk={(msg) => {
            showSuccess(msg);
            setPasswordUser(null);
          }}
        />
      ) : null}

      {fingerprintUser ? (
        <UserFingerprintModal
          user={fingerprintUser}
          onClose={() => {
            setFingerprintUser(null);
            refreshUsers();
          }}
          onChanged={() => {
            showSuccess(t.common.success);
            refreshUsers();
          }}
        />
      ) : null}

      {showResetModal ? (
        <Modal
          title={t.settings.resetBusinessData}
          onClose={() => {
            if (resetBusy) return;
            setShowResetModal(false);
            setResetTyped("");
            setResetError(null);
          }}
        >
          <div className="stack">
            <p className="error" style={{ margin: 0, fontWeight: 600 }}>
              {t.settings.resetBusinessDataWarning}
            </p>
            <label className="stack" style={{ gap: "0.25rem" }}>
              <span>{t.settings.resetTypeReset}</span>
              <input
                value={resetTyped}
                autoComplete="off"
                spellCheck={false}
                disabled={resetBusy}
                placeholder={t.settings.resetPlaceholder}
                onChange={(e) => setResetTyped(e.target.value)}
              />
            </label>
            <ModalErrorBanner message={resetError} />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={resetBusy}
                onClick={() => {
                  setShowResetModal(false);
                  setResetTyped("");
                  setResetError(null);
                }}
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                className="secondary danger"
                disabled={resetBusy || resetTyped !== "RESET"}
                onClick={() => void handleResetBusinessData()}
              >
                {resetBusy ? t.settings.resetInProgress : t.settings.resetConfirmButton}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {fileRestoreAlert ? (
        <Modal
          title={fileRestoreAlert.title}
          onClose={() => setFileRestoreAlert(null)}
        >
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{fileRestoreAlert.message}</p>
          <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-action btn-action--ok"
              data-desk-action="ok"
              onClick={() => setFileRestoreAlert(null)}
            >
              {t.backup.restoreFromFileOk}
            </button>
          </div>
        </Modal>
      ) : null}
      {successModal}
    </div>
  );
}

function UserFormModal({
  screens,
  initial,
  busy,
  error,
  actorUserId,
  onClose,
  onBusy,
  onError,
  onSaved,
  onDone,
}: {
  screens: DeskScreenOption[];
  initial: UserAccount | null;
  busy: boolean;
  error: string | null;
  actorUserId?: string;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onSaved: (msg: string) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [createdUser, setCreatedUser] = useState<UserAccount | null>(null);
  const activeUser = createdUser ?? initial;
  const isEdit = Boolean(initial) || Boolean(createdUser);
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role ?? "CASHIER");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [screenRights, setScreenRights] = useState<Record<string, ScreenAccessLevel>>(
    () => rightsFromUser(initial, screens),
  );
  const [pinSetupOpen, setPinSetupOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinConfigured, setPinConfigured] = useState(
    Boolean(initial?.authPinConfigured),
  );
  const [fingerprintEnrolled, setFingerprintEnrolled] = useState(
    Boolean(initial?.fingerprintEnrolled),
  );
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const [passwordPromptBusy, setPasswordPromptBusy] = useState(false);
  const [passwordPromptError, setPasswordPromptError] = useState<string | null>(null);
  const [passwordPending, setPasswordPending] = useState<"user-save" | null>(null);

  const isSystemAdmin =
    Boolean(activeUser) && isSystemAdminUsername(activeUser?.username);

  useEffect(() => {
    if (!isSystemAdmin) return;
    let cancelled = false;
    void getAdminAuthPinStatus()
      .then((status) => {
        if (cancelled) return;
        setPinConfigured(status.configured);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [isSystemAdmin]);

  function setScreenAccess(id: string, access: ScreenAccessLevel | null) {
    setScreenRights((current) => {
      const next = { ...current };
      if (access == null) delete next[id];
      else next[id] = access;
      return next;
    });
  }

  async function performUserSave(adminPassword: string | null) {
    onBusy(true);
    onError(null);
    try {
      if (activeUser) {
        await updateUser({
          id: activeUser.id,
          fullName: fullName.trim(),
          role: isSystemAdmin ? "ADMIN" : role,
          isActive: isSystemAdmin ? true : isActive,
          allowedScreens: isSystemAdmin ? null : undefined,
          screenRights: isSystemAdmin ? null : screenRights,
          actorUserId: actorUserId ?? null,
          confirmPassword: isSystemAdmin ? adminPassword : null,
        });
        onSaved(t.common.success);
        if (initial) onDone();
      } else {
        const created = await createUser({
          fullName: fullName.trim(),
          username: username.trim(),
          password,
          role,
          isActive,
          screenRights,
        });
        setCreatedUser(created);
        setFingerprintEnrolled(Boolean(created.fingerprintEnrolled));
        setPassword("");
        onSaved(t.common.success);
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      onBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    onError(null);
    if (activeUser && isSystemAdmin) {
      setPasswordPending("user-save");
      setPasswordPromptError(null);
      setPasswordPromptOpen(true);
      return;
    }
    await performUserSave(null);
  }

  async function onAdminPasswordConfirmed(adminPassword: string) {
    setPasswordPromptBusy(true);
    setPasswordPromptError(null);
    try {
      if (passwordPending === "user-save") {
        await performUserSave(adminPassword);
        setPasswordPromptOpen(false);
        setPasswordPending(null);
      }
    } catch (err: unknown) {
      setPasswordPromptError(err instanceof Error ? err.message : String(err));
    } finally {
      setPasswordPromptBusy(false);
    }
  }

  return (
    <Modal
      title={isEdit ? `${t.common.edit} — ${initial?.username}` : t.common.create}
      size="lg"
      onClose={onClose}
    >
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <div className="customer-form-grid">
          <label>
            {t.common.fullName} *
            <input value={fullName} required onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            {t.users.username} *
            <input
              className="ltr-text"
              dir="ltr"
              autoComplete="username"
              value={username}
              required
              disabled={isEdit}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          {!isEdit ? (
            <label>
              {t.users.password} *
              <input
                type="password"
                value={password}
                required
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          ) : null}
          <label>
            {t.users.role} *
            <select
              value={isSystemAdmin ? "ADMIN" : role}
              disabled={isSystemAdmin}
              onChange={(e) => {
                if (isSystemAdmin) return;
                const next = e.target.value;
                setRole(next);
                setScreenRights(defaultScreenRightsForRole(next, screens));
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.common.status}
            <select
              value={isSystemAdmin || isActive ? "active" : "inactive"}
              disabled={isSystemAdmin}
              onChange={(e) => {
                if (isSystemAdmin) return;
                setIsActive(e.target.value === "active");
              }}
            >
              <option value="active">{t.common.active}</option>
              <option value="inactive">{t.common.inactive}</option>
            </select>
          </label>
        </div>

        <div>
          <strong>{t.users.screenRights}</strong>
          <p className="muted" style={{ margin: "0.25rem 0 0.5rem" }}>
            {isSystemAdmin
              ? t.users.systemAdminRightsLocked
              : t.users.screenRightsHint}
          </p>
          <div className="settings-rights-grid settings-rights-grid-rw">
            {screens.map((screen) => {
              const access = screenRights[screen.id];
              const hasRead = isSystemAdmin || access === "read" || access === "write";
              const hasWrite = isSystemAdmin || access === "write";
              return (
                <div key={screen.id} className="settings-right-item settings-right-item-rw">
                  <span className="settings-right-label">{screen.label}</span>
                  <label className="settings-right-cap">
                    <input
                      type="checkbox"
                      checked={hasRead}
                      disabled={isSystemAdmin}
                      onChange={() => {
                        if (isSystemAdmin) return;
                        if (hasWrite) setScreenAccess(screen.id, "read");
                        else if (hasRead) setScreenAccess(screen.id, null);
                        else setScreenAccess(screen.id, "read");
                      }}
                    />
                    <span>{t.users.accessRead}</span>
                  </label>
                  <label className="settings-right-cap">
                    <input
                      type="checkbox"
                      checked={hasWrite}
                      disabled={isSystemAdmin}
                      onChange={() => {
                        if (isSystemAdmin) return;
                        if (hasWrite) setScreenAccess(screen.id, "read");
                        else setScreenAccess(screen.id, "write");
                      }}
                    />
                    <span>{t.users.accessWrite}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {isSystemAdmin ? (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <strong>{t.users.security}</strong>
            <p className="muted" style={{ margin: 0 }}>
              {t.users.authorizationPinHint}
            </p>
            <p style={{ margin: 0, fontWeight: 650 }}>
              {t.users.authorizationPin}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {pinConfigured ? t.users.pinStatusSet : t.users.pinStatusNotSet}
            </p>
            <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPinError(null);
                  setPinSetupOpen(true);
                }}
              >
                {pinConfigured ? t.users.changeAuthPin : t.users.setAuthPin}
              </button>
            </div>
          </div>
        ) : null}

        <UserFingerprintEnrollBlock
          userId={activeUser?.id ?? ""}
          enrolled={fingerprintEnrolled}
          disabled={busy}
          hint={
            activeUser
              ? t.users.fingerprintHint
              : t.users.fingerprintSaveFirst
          }
          onEnrolled={() => setFingerprintEnrolled(true)}
          onCleared={() => setFingerprintEnrolled(false)}
        />

        <div className="modal-form-footer">
          <ModalErrorBanner message={error} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={createdUser ? onDone : onClose}
              disabled={busy}
            >
              {createdUser ? t.common.close : t.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy
                ? t.common.saving
                : activeUser
                  ? t.users.saveUser
                  : t.common.create}
            </button>
          </div>
        </div>
      </form>
      <AdminPasswordConfirmModal
        open={passwordPromptOpen}
        busy={passwordPromptBusy}
        error={passwordPromptError}
        onCancel={() => {
          if (passwordPromptBusy) return;
          setPasswordPromptOpen(false);
          setPasswordPending(null);
          setPasswordPromptError(null);
        }}
        onConfirm={(adminPassword) => void onAdminPasswordConfirmed(adminPassword)}
      />
      <AuthPinSetupModal
        open={pinSetupOpen}
        changing={pinConfigured}
        busy={pinBusy}
        error={pinError}
        onClose={() => {
          if (!pinBusy) setPinSetupOpen(false);
        }}
        onSubmit={(input) => {
          setPinBusy(true);
          setPinError(null);
          void setAdminAuthPin({
            password: input.password,
            pin: input.pin,
            pinConfirm: input.pinConfirm,
            actorUserId: actorUserId ?? null,
            targetUserId: initial?.id ?? null,
          })
            .then((status) => {
              setPinConfigured(status.configured);
              clearVaultUnlockSession();
              setPinSetupOpen(false);
              onSaved(t.users.authPinConfiguredOk);
            })
            .catch((err: unknown) => {
              setPinError(errorMessage(err));
            })
            .finally(() => setPinBusy(false));
        }}
      />
    </Modal>
  );
}

type UserEnrollUiPhase =
  | "ready"
  | "scan1"
  | "captured1"
  | "remove1"
  | "scan2"
  | "captured2"
  | "remove2"
  | "scan3"
  | "captured3"
  | "success"
  | "failure";

function userEnrollPhaseFromProgress(
  ev: FingerprintEnrollProgress,
): UserEnrollUiPhase | null {
  const scan = Number(ev.scan);
  if (ev.phase === "scan") {
    if (scan === 1) return "scan1";
    if (scan === 2) return "scan2";
    if (scan === 3) return "scan3";
  }
  if (ev.phase === "captured") {
    if (scan === 1) return "captured1";
    if (scan === 2) return "captured2";
    if (scan === 3) return "captured3";
  }
  if (ev.phase === "remove") {
    if (scan === 1) return "remove1";
    if (scan === 2) return "remove2";
  }
  return null;
}

function userEnrollDoneCount(phase: UserEnrollUiPhase): number {
  switch (phase) {
    case "captured1":
    case "remove1":
    case "scan2":
      return 1;
    case "captured2":
    case "remove2":
    case "scan3":
      return 2;
    case "captured3":
    case "success":
      return 3;
    default:
      return 0;
  }
}

function userEnrollScanState(
  phase: UserEnrollUiPhase,
  scan: 1 | 2 | 3,
): "idle" | "active" | "lift" | "done" {
  if (phase === "failure" || phase === "ready") return "idle";
  const doneCount = userEnrollDoneCount(phase);
  if (scan <= doneCount) return "done";
  if (phase === "scan1" && scan === 1) return "active";
  if (phase === "scan2" && scan === 2) return "active";
  if (phase === "scan3" && scan === 3) return "active";
  if (phase === "remove1" && scan === 2) return "lift";
  if (phase === "remove2" && scan === 3) return "lift";
  return "idle";
}

function userEnrollStageStatus(
  phase: UserEnrollUiPhase,
  busy: boolean,
  enrolled: boolean,
): FingerprintScanStatus {
  if (phase === "failure") return "error";
  if (phase === "success" || phase === "captured3" || (enrolled && phase === "ready")) {
    return "success";
  }
  if (
    phase === "captured1" ||
    phase === "captured2" ||
    phase === "remove1" ||
    phase === "remove2"
  ) {
    return "lift";
  }
  if (busy || phase === "scan1" || phase === "scan2" || phase === "scan3") {
    return "scanning";
  }
  return "idle";
}

/** Enroll / clear fingerprint for desk-user sign-in (create stays open after save). */
function UserFingerprintEnrollBlock({
  userId,
  enrolled,
  disabled,
  hint,
  onEnrolled,
  onCleared,
}: {
  userId: string;
  enrolled: boolean;
  disabled?: boolean;
  hint?: string;
  onEnrolled: () => void;
  onCleared: () => void;
}) {
  const t = useT();
  const [enrollPhase, setEnrollPhase] = useState<UserEnrollUiPhase>("ready");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);
  const canEnroll = !disabled && Boolean(userId.trim()) && !enrollBusy && !clearBusy;

  async function handleEnrollFingerprint() {
    if (!canEnroll) return;
    const id = userId.trim();
    if (!id) return;
    setEnrollBusy(true);
    pauseFingerprintIdentify();
    setEnrollMessage(null);
    setEnrollPhase("ready");

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<FingerprintEnrollProgress>(
        "fingerprint-enroll-progress",
        (event) => {
          const next = userEnrollPhaseFromProgress(event.payload);
          if (!next) return;
          if (
            next === "captured1" ||
            next === "captured2" ||
            next === "captured3"
          ) {
            playFingerprintSound("register");
          }
          flushSync(() => setEnrollPhase(next));
        },
      );

      flushSync(() => setEnrollPhase("scan1"));
      const result = await enrollUserFingerprint(id);
      if (result.ok) {
        flushSync(() => {
          setEnrollPhase("success");
          setEnrollMessage(result.message || t.customers.enrollSuccess);
        });
        onEnrolled();
      } else {
        const message = result.message || t.customers.enrollFailure;
        if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
        setEnrollPhase("failure");
        setEnrollMessage(message);
      }
    } catch (err: unknown) {
      const message = errorMessage(err, t.customers.enrollFailure);
      if (isUnmatchedFingerprint(message)) notifyWrongFingerprint();
      setEnrollPhase("failure");
      setEnrollMessage(message);
    } finally {
      unlisten?.();
      resumeFingerprintIdentify();
      setEnrollBusy(false);
    }
  }

  async function handleClearFingerprint() {
    if (!userId.trim() || clearBusy || enrollBusy || disabled) return;
    if (!window.confirm(t.users.fingerprintClearConfirm)) return;
    setClearBusy(true);
    setEnrollMessage(null);
    try {
      await clearUserFingerprint(userId.trim());
      setEnrollPhase("ready");
      onCleared();
    } catch (err: unknown) {
      setEnrollPhase("failure");
      setEnrollMessage(errorMessage(err, t.customers.enrollFailure));
    } finally {
      setClearBusy(false);
    }
  }

  const statusLine =
    enrollPhase === "success" || enrollPhase === "captured3"
      ? enrollMessage ?? t.customers.enrollSuccess
      : enrollPhase === "failure"
        ? enrollMessage ?? t.customers.enrollFailure
        : enrollPhase === "scan1" ||
            enrollPhase === "scan2" ||
            enrollPhase === "scan3"
          ? t.customers.enrollScanShort
          : enrollPhase === "captured1" ||
              enrollPhase === "captured2" ||
              enrollPhase === "remove1" ||
              enrollPhase === "remove2"
            ? t.customers.enrollLiftShort
            : enrolled
              ? t.users.fingerprintEnrolled
              : (hint ?? t.users.fingerprintHint);

  return (
    <section
      className={[
        "fp-enroll-panel",
        enrollPhase === "success" || enrolled ? "fp-enroll-panel--ok" : "",
        enrollPhase === "failure" ? "fp-enroll-panel--fail" : "",
        enrollBusy ? "fp-enroll-panel--busy" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t.users.fingerprintTitle}
    >
      <div className="fp-enroll-head">
        <div>
          <h3 className="fp-enroll-title">{t.users.fingerprintTitle}</h3>
          {statusLine ? <p className="fp-enroll-hint muted">{statusLine}</p> : null}
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {enrolled ? (
            <button
              type="button"
              className="secondary"
              disabled={disabled || enrollBusy || clearBusy}
              onClick={() => void handleClearFingerprint()}
            >
              {clearBusy ? t.users.fingerprintBusy : t.users.fingerprintClear}
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary fp-enroll-cta"
            disabled={!canEnroll}
            onClick={() => void handleEnrollFingerprint()}
          >
            {enrollBusy ? t.users.fingerprintBusy : t.users.fingerprintEnroll}
          </button>
        </div>
      </div>

      <FingerprintScanStage
        status={userEnrollStageStatus(enrollPhase, enrollBusy, enrolled)}
        size="compact"
      />

      <div className="fp-enroll-progress" aria-live="polite">
        {([1, 2, 3] as const).map((scan) => {
          const state = userEnrollScanState(enrollPhase, scan);
          return (
            <span
              key={scan}
              className={`fp-enroll-dot fp-enroll-dot--${state}`}
              title={`${t.customers.enrollReady} ${scan}`}
            />
          );
        })}
      </div>

      {enrollPhase === "failure" ? (
        <ModalErrorBanner message={enrollMessage ?? t.customers.enrollFailure} />
      ) : null}
    </section>
  );
}

function UserFingerprintModal({
  user,
  onClose,
  onChanged,
}: {
  user: UserAccount;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [enrolled, setEnrolled] = useState(Boolean(user.fingerprintEnrolled));
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    const value = adminPassword.trim();
    if (!value) {
      setPasswordError(t.users.adminPasswordRequired);
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await verifyAdminPassword(value);
      setPasswordVerified(true);
      setAdminPassword("");
    } catch (err: unknown) {
      setPasswordError(errorMessage(err, t.users.adminPasswordRequired));
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <Modal
      title={`${t.users.fingerprintTitle} · ${user.fullName || user.username}`}
      onClose={() => {
        if (passwordBusy) return;
        onClose();
      }}
    >
      {!passwordVerified ? (
        <form className="stack" onSubmit={(e) => void submitPassword(e)}>
          <p className="muted" style={{ margin: 0 }}>
            {t.users.fingerprintPasswordHint}
          </p>
          <label>
            {t.users.password}
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={adminPassword}
              disabled={passwordBusy}
              required
              onChange={(e) => {
                setAdminPassword(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
            />
          </label>
          <ModalErrorBanner message={passwordError} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={passwordBusy}
              onClick={onClose}
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={passwordBusy || !adminPassword.trim()}
            >
              {passwordBusy ? t.common.saving : t.common.confirm}
            </button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <UserFingerprintEnrollBlock
            userId={user.id}
            enrolled={enrolled}
            hint={t.users.fingerprintHint}
            onEnrolled={() => {
              setEnrolled(true);
              onChanged();
            }}
            onCleared={() => {
              setEnrolled(false);
              onChanged();
            }}
          />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t.common.close}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PasswordModal({
  user,
  busy,
  error,
  onClose,
  onBusy,
  onError,
  onOk,
}: {
  user: UserAccount;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onOk: (msg: string) => void;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      onError(t.common.error);
      return;
    }
    onBusy(true);
    onError(null);
    try {
      await resetUserPassword({ id: user.id, password });
      onOk(t.common.success);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(false);
    }
  }

  return (
    <Modal title={`${t.users.resetPassword} — ${user.username}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => void submit(e)}>
        <p className="muted" style={{ margin: 0 }}>
          {t.users.resetPasswordHint}
        </p>
        <label>
          {t.users.newPassword} *
          <input
            type="password"
            value={password}
            required
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          {t.users.confirmNewPassword} *
          <input
            type="password"
            value={confirm}
            required
            minLength={8}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        <div className="modal-form-footer">
          <ModalErrorBanner message={error} />
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {t.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? t.common.saving : t.common.update}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
