import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  archivePartner,
  listPartnersPage,
  type PartnerListItem,
  type PartnerListPage,
} from "@desktop/api";
import { useT } from "@desktop/i18n";
import { useDeskDataRefresh } from "@desktop/lib/use-desk-data-refresh";
import { PartnerCreateForm } from "@desktop/pages/partner-forms";
import { useConfirmDialog } from "@desktop/ui/confirm-dialog";
import { DeskContextMenu } from "@desktop/ui/desk-context-menu";
import { Modal } from "@desktop/ui/modal";
import { Pagination } from "@desktop/ui/pagination";
import { useSuccessModal } from "@desktop/ui/use-success-modal";

export function PartnersPage() {
  const t = useT();
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();
  const [pageData, setPageData] = useState<PartnerListPage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, successModal } = useSuccessModal();
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    partner: PartnerListItem;
  } | null>(null);

  useDeskDataRefresh(() => {
    setReloadKey((k) => k + 1);
  });

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

  async function handleArchive(partnerId: string, partnerName: string) {
    const ok = await confirm({
      title: t.common.archive,
      message: `${t.common.archive} “${partnerName}”?`,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await archivePartner(partnerId);
      setPageData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((p) => p.id !== partnerId),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
      setReloadKey((k) => k + 1);
      showSuccess(t.common.success);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack partner-page workspace-page">
      {error && !showForm ? <p className="error">{error}</p> : null}
      {busy && !pageData ? (
        <p className="muted">{t.partner.loadingPartners}</p>
      ) : null}

      <section className="panel records-panel">
        <div className="records-chrome">
          <div className="records-title">
            <div>
              <h2>{t.nav.partnerSarafi}</h2>
              <span className="count-badge">{pageData?.total ?? 0}</span>
            </div>
            <div className="records-title-actions">
              <button
                type="button"
                className="btn primary"
                data-desk-action="new"
                data-desk-primary
                onClick={() => setShowForm(true)}
              >
                {t.partner.add}
              </button>
            </div>
          </div>
          <div className="table-toolbar">
            <label className="search-field search-field-emphasized">
              <input
                type="search"
                className="desk-search"
                value={searchInput}
                placeholder={t.partner.searchPlaceholder}
                aria-label={t.common.search}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </label>
          </div>
        </div>
        {pageData ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.common.name}</th>
                    <th>{t.common.phone}</th>
                    <th>{t.common.city}</th>
                    <th>{t.common.country}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t.partner.emptyTitle}
                      </td>
                    </tr>
                  ) : (
                    pageData.items.map((p) => (
                      <tr
                        key={p.id}
                        className="customer-row-clickable"
                        onClick={() => navigate(`/partners/${p.id}`)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setRowMenu({ x: e.clientX, y: e.clientY, partner: p });
                        }}
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
                        <td>
                          {p.phone ? (
                            <span className="ltr-text phone-ltr" dir="ltr">
                              {p.phone}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{p.city ?? "—"}</td>
                        <td>{p.country ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="records-pagination">
              <Pagination
                page={page}
                pageSize={pageSize}
                total={pageData.total}
                busy={busy}
                onPageChange={setPage}
              />
            </div>
          </>
        ) : null}
      </section>

      {rowMenu ? (
        <DeskContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          items={[
            {
              id: "archive",
              label: t.common.archive,
              danger: true,
              disabled: busy,
              onSelect: () => void handleArchive(rowMenu.partner.id, rowMenu.partner.name),
            },
          ]}
          onClose={() => setRowMenu(null)}
        />
      ) : null}

      {showForm ? (
        <Modal
          title={t.partner.add}
          size="lg"
          onClose={() => !busy && setShowForm(false)}
        >
          <PartnerCreateForm
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              showSuccess(t.partner.savePartner);
              setReloadKey((k) => k + 1);
            }}
          />
        </Modal>
      ) : null}
      {successModal}
    </div>
  );
}
