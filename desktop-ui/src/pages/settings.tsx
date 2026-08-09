import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createCurrency,
  createDbBackup,
  createUser,
  getAppInfo,
  listCurrenciesPage,
  listDbBackups,
  listDeskScreens,
  listUsers,
  resetUserPassword,
  restoreDbBackup,
  updateCurrency,
  updateUser,
  type AppInfo,
  type BackupListItem,
  type CurrencyListItem,
  type DeskScreenOption,
  type UserAccount,
} from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useLocale, useT } from "@desktop/i18n";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { formatBytes } from "@desktop/lib/datetime";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n/locale";

type SettingsTab = "general" | "currencies" | "users" | "backup";

const ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const;

function defaultScreensForRole(role: string, screens: DeskScreenOption[]): string[] {
  const all = screens.map((s) => s.id);
  if (role === "ADMIN") return all;
  if (role === "MANAGER") {
    return all.filter((id) => id !== "backup");
  }
  return all.filter((id) =>
    ["dashboard", "cash", "customers", "exchange", "hawala", "daybook", "transactions"].includes(
      id,
    ),
  );
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
  const [tab, setTab] = useState<SettingsTab>("general");

  const [info, setInfo] = useState<AppInfo | null>(null);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyListItem[]>([]);
  const [currenciesTotal, setCurrenciesTotal] = useState(0);
  const [currenciesPage, setCurrenciesPage] = useState(1);
  const currenciesPageSize = 25;
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [screens, setScreens] = useState<DeskScreenOption[]>([]);

  const [busy, setBusy] = useState(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [userBusy, setUserBusy] = useState(false);
  const [localeBusy, setLocaleBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [currencyOk, setCurrencyOk] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [userOk, setUserOk] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newPlaces, setNewPlaces] = useState("2");

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserAccount | null>(null);

  const tabs: Array<{ id: SettingsTab; label: string }> = useMemo(
    () => [
      { id: "general", label: t.settings.general },
      { id: "currencies", label: t.pages.currencies },
      { id: "users", label: t.settings.users },
      { id: "backup", label: t.settings.backup },
    ],
    [t],
  );

  const refreshBackups = useCallback(() => {
    void listDbBackups()
      .then(setBackups)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const refreshCurrencies = useCallback(() => {
    void listCurrenciesPage({
      activeOnly: false,
      page: currenciesPage,
      pageSize: currenciesPageSize,
    })
      .then((page) => {
        setCurrencies(page.items);
        setCurrenciesTotal(page.total);
      })
      .catch((err: unknown) => {
        setCurrencyError(err instanceof Error ? err.message : String(err));
      });
  }, [currenciesPage]);

  const refreshUsers = useCallback(() => {
    void Promise.all([listUsers(), listDeskScreens()])
      .then(([list, deskScreens]) => {
        setUsers(list);
        setScreens(deskScreens);
      })
      .catch((err: unknown) => {
        setUserError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    void getAppInfo()
      .then(setInfo)
      .catch(() => undefined);
    refreshBackups();
    refreshCurrencies();
    refreshUsers();
  }, [refreshBackups, refreshCurrencies, refreshUsers]);

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

  async function handleBackup() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await createDbBackup("manual");
      setOk(t.common.success);
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

  async function handleRestore(stamp: string) {
    if (
      !window.confirm(
        t.backup.restoreConfirmTitle.replace("{stamp}", stamp),
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const result = await restoreDbBackup(stamp);
      setOk(result.message);
      refreshBackups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCurrency(event: FormEvent) {
    event.preventDefault();
    setCurrencyBusy(true);
    setCurrencyError(null);
    setCurrencyOk(null);
    try {
      const places = Number.parseInt(newPlaces, 10);
      await createCurrency({
        code: newCode.trim(),
        name: newName.trim(),
        symbol: newSymbol.trim() || null,
        decimalPlaces: Number.isFinite(places) ? places : 2,
        isActive: true,
      });
      setCurrencyOk(t.common.success);
      setNewCode("");
      setNewName("");
      setNewSymbol("");
      setNewPlaces("2");
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurrencyBusy(false);
    }
  }

  async function toggleCurrencyActive(row: CurrencyListItem) {
    setCurrencyBusy(true);
    setCurrencyError(null);
    setCurrencyOk(null);
    try {
      const updated = await updateCurrency({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        decimalPlaces: row.decimalPlaces,
        isActive: !row.isActive,
      });
      setCurrencyOk(
        updated.isActive ? t.common.activate : t.common.deactivate,
      );
      refreshCurrencies();
    } catch (err: unknown) {
      setCurrencyError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurrencyBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 style={{ margin: "0 0 0.25rem" }}>{t.nav.settings}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t.settings.shopPreferences}
        </p>
      </div>

      <div className="settings-tabs" role="tablist" aria-label={t.settings.sections}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "settings-tab active" : "settings-tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "general" ? (
        <div className="stack">
          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.session}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t.session.account}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={signingOut}
              style={{ alignSelf: "start" }}
              onClick={() => {
                setSigningOut(true);
                void logout().finally(() => setSigningOut(false));
              }}
            >
              {signingOut ? t.session.signingOut : t.session.signOut}
            </button>
          </div>

          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.language}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {t.settings.languageHint}
            </p>
            <label>
              {t.settings.language}
              <select
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
          </div>

          <div className="card stack">
            <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.general}</h2>
            {info ? (
              <p className="muted" style={{ margin: 0 }}>
                {info.name} · {info.backend} · v{info.version}
                <br />
                DB: {info.dbPath}
              </p>
            ) : (
              <p className="muted">{t.common.loading}</p>
            )}
            {error && tab === "general" ? <p className="error">{error}</p> : null}
          </div>
        </div>
      ) : null}

      {tab === "currencies" ? (
        <div className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.pages.currencies}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {t.settings.catalog}
          </p>

          <form
            className="row"
            onSubmit={(e) => void handleCreateCurrency(e)}
            style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "end" }}
          >
            <label style={{ minWidth: 90 }}>
              {t.currencies.code} *
              <input
                value={newCode}
                placeholder="USD"
                maxLength={8}
                required
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              />
            </label>
            <label style={{ flex: 1, minWidth: 160 }}>
              {t.common.name} *
              <input
                value={newName}
                placeholder={t.common.name}
                required
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <label style={{ minWidth: 90 }}>
              {t.currencies.symbol}
              <input
                value={newSymbol}
                placeholder="$"
                maxLength={16}
                onChange={(e) => setNewSymbol(e.target.value)}
              />
            </label>
            <label style={{ minWidth: 90 }}>
              {t.currencies.decimals}
              <input
                type="number"
                min={0}
                max={6}
                value={newPlaces}
                onChange={(e) => setNewPlaces(e.target.value)}
              />
            </label>
            <button type="submit" className="btn primary" disabled={currencyBusy}>
              {currencyBusy ? t.common.saving : t.common.create}
            </button>
          </form>

          {currencyError ? <p className="error">{currencyError}</p> : null}
          {currencyOk ? <p className="ok">{currencyOk}</p> : null}

          <table>
            <thead>
              <tr>
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
                  <td colSpan={6} className="muted">
                    {t.currencies.emptyTitle}
                  </td>
                </tr>
              ) : (
                currencies.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.code}</strong>
                    </td>
                    <td>{row.name}</td>
                    <td>{row.symbol ?? "—"}</td>
                    <td>{row.decimalPlaces}</td>
                    <td>
                      {row.isActive ? (
                        <span className="badge badge-ok">{t.common.active}</span>
                      ) : (
                        <span className="badge">{t.common.inactive}</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        disabled={currencyBusy}
                        onClick={() => void toggleCurrencyActive(row)}
                      >
                        {row.isActive ? t.common.deactivate : t.common.activate}
                      </button>
                    </td>
                  </tr>
                ))
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
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t.settings.users}</h2>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {t.users.manageAccounts}
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setEditingUser(null);
                setShowUserForm(true);
                setUserError(null);
                setUserOk(null);
              }}
            >
              {t.common.create}
            </button>
          </div>

          {userError ? <p className="error">{userError}</p> : null}
          {userOk ? <p className="ok">{userOk}</p> : null}

          <table>
            <thead>
              <tr>
                <th>{t.common.name}</th>
                <th>{t.users.username}</th>
                <th>{t.users.role}</th>
                <th>{t.users.screenRights}</th>
                <th>{t.common.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {t.users.emptyTitle}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.fullName}</strong>
                    </td>
                    <td>{user.username}</td>
                    <td>{user.role}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {user.allowedScreens.length === 0
                        ? t.common.all
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
                      <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          disabled={userBusy}
                          onClick={() => {
                            setEditingUser(user);
                            setShowUserForm(true);
                            setUserError(null);
                            setUserOk(null);
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
                            setUserOk(null);
                          }}
                        >
                          {t.users.password}
                        </button>
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
            <button type="button" disabled={busy} onClick={() => void handleBackup()}>
              {busy ? t.backup.inProgress : t.backup.createBackup}
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {t.backup.hint}
          </p>
          {error ? <p className="error">{error}</p> : null}
          {ok ? <p className="ok">{ok}</p> : null}
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

      {showUserForm ? (
        <UserFormModal
          screens={screens}
          initial={editingUser}
          busy={userBusy}
          actorUserId={session?.userId}
          onClose={() => {
            setShowUserForm(false);
            setEditingUser(null);
          }}
          onBusy={setUserBusy}
          onError={setUserError}
          onOk={(msg) => {
            setUserOk(msg);
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
          onClose={() => setPasswordUser(null)}
          onBusy={setUserBusy}
          onError={setUserError}
          onOk={(msg) => {
            setUserOk(msg);
            setPasswordUser(null);
          }}
        />
      ) : null}
    </div>
  );
}

function UserFormModal({
  screens,
  initial,
  busy,
  actorUserId,
  onClose,
  onBusy,
  onError,
  onOk,
}: {
  screens: DeskScreenOption[];
  initial: UserAccount | null;
  busy: boolean;
  actorUserId?: string;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onError: (msg: string | null) => void;
  onOk: (msg: string) => void;
}) {
  const t = useT();
  const isEdit = Boolean(initial);
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role ?? "CASHIER");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [allowedScreens, setAllowedScreens] = useState<string[]>(
    initial?.allowedScreens?.length
      ? initial.allowedScreens
      : defaultScreensForRole(initial?.role ?? "CASHIER", screens),
  );

  function toggleScreen(id: string) {
    setAllowedScreens((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    onBusy(true);
    onError(null);
    try {
      if (isEdit && initial) {
        await updateUser({
          id: initial.id,
          fullName: fullName.trim(),
          role,
          isActive,
          allowedScreens,
          actorUserId: actorUserId ?? null,
        });
        onOk(t.common.success);
      } else {
        await createUser({
          fullName: fullName.trim(),
          username: username.trim(),
          password,
          role,
          isActive,
          allowedScreens,
        });
        onOk(t.common.success);
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(false);
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
              value={username}
              required
              disabled={isEdit}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
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
              value={role}
              onChange={(e) => {
                const next = e.target.value;
                setRole(next);
                setAllowedScreens(defaultScreensForRole(next, screens));
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
              value={isActive ? "active" : "inactive"}
              onChange={(e) => setIsActive(e.target.value === "active")}
            >
              <option value="active">{t.common.active}</option>
              <option value="inactive">{t.common.inactive}</option>
            </select>
          </label>
        </div>

        <div>
          <strong>{t.users.screenRights}</strong>
          <p className="muted" style={{ margin: "0.25rem 0 0.5rem" }}>
            {t.users.permissions}
          </p>
          <div className="settings-rights-grid">
            {screens.map((screen) => (
              <label key={screen.id} className="settings-right-item">
                <input
                  type="checkbox"
                  checked={allowedScreens.includes(screen.id)}
                  onChange={() => toggleScreen(screen.id)}
                />
                <span>{screen.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t.common.saving : isEdit ? t.users.saveUser : t.common.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({
  user,
  busy,
  onClose,
  onBusy,
  onError,
  onOk,
}: {
  user: UserAccount;
  busy: boolean;
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
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? t.common.saving : t.common.update}
          </button>
        </div>
      </form>
    </Modal>
  );
}
