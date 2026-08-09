import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  archivePartner,
  createPartner,
  listPartnersPage,
  type PartnerListPage,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";

export function PartnersPage() {
  const t = useT();
  const navigate = useNavigate();
  const [pageData, setPageData] = useState<PartnerListPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return;
      setPage(1);
      setSearch(next);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void listPartnersPage({
      search: search.trim() || undefined,
      archiveFilter: "active",
      page,
      pageSize,
    })
      .then((result) => {
        if (!cancelled) {
          setPageData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, page, reloadKey]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await createPartner({
        name,
        phone: phone || null,
        city: city || null,
        country: country || null,
        notes: notes || null,
      });
      setName("");
      setPhone("");
      setCity("");
      setCountry("");
      setNotes("");
      setShowForm(false);
      setOk(t.partner.savePartner);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(partnerId: string, partnerName: string) {
    if (!window.confirm(`${t.common.archive} “${partnerName}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await archivePartner(partnerId);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack partner-page">
      <div
        className="row"
        style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}
      >
        <div>
          <h1 style={{ margin: "0 0 0.2rem" }}>{t.nav.partnerSarafi}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t.partner.emptyHint}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setShowForm(true)}>
          {t.partner.add}
        </button>
      </div>

      <div className="section-card stack">
        <label className="partner-search">
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            {t.common.search}
          </span>
          <input
            value={searchInput}
            placeholder={t.partner.searchPlaceholder}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {ok ? <p className="ok">{ok}</p> : null}
        {busy && !pageData ? (
          <p className="muted">{t.partner.loadingPartners}</p>
        ) : null}
        {pageData ? (
          <>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t.common.name}</th>
                    <th>{t.common.phone}</th>
                    <th>{t.common.city}</th>
                    <th>{t.common.country}</th>
                    <th>{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        {t.partner.emptyTitle}
                      </td>
                    </tr>
                  ) : (
                    pageData.items.map((p) => (
                      <tr
                        key={p.id}
                        className="customer-row-clickable"
                        onClick={() => navigate(`/partners/${p.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/partners/${p.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`${t.common.view} ${p.name}`}
                      >
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{p.phone ?? "—"}</td>
                        <td>{p.city ?? "—"}</td>
                        <td>{p.country ?? "—"}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => void handleArchive(p.id, p.name)}
                          >
                            {t.common.archive}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={pageData.total}
              busy={busy}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </div>

      {showForm ? (
        <Modal title={t.partner.add} onClose={() => !busy && setShowForm(false)}>
          <form className="stack" onSubmit={(e) => void handleCreate(e)}>
            <label>
              {t.common.name} *
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="exchange-fields-grid">
              <label>
                {t.common.phone}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label>
                {t.common.city}
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                {t.common.country}
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </label>
              <label>
                {t.common.notes}
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setShowForm(false)}
              >
                {t.common.cancel}
              </button>
              <button type="submit" disabled={busy}>
                {busy ? t.common.saving : t.partner.savePartner}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
