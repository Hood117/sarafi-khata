import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { getLicenseStatus } from "@desktop/api";
import { useAuth } from "@desktop/auth";
import { useT } from "@desktop/i18n";
import { AppLayout } from "@desktop/layout";
import { LicenseActivatePage } from "@desktop/pages/license-activate";
import { LoginPage } from "@desktop/pages/login";

const CustomerDetailPage = lazy(() =>
  import("@desktop/pages/customer-detail").then((m) => ({
    default: m.CustomerDetailPage,
  })),
);
const CustomersPage = lazy(() =>
  import("@desktop/pages/customers").then((m) => ({ default: m.CustomersPage })),
);
const DebtorsCreditorsPage = lazy(() =>
  import("@desktop/pages/debtors-creditors").then((m) => ({
    default: m.DebtorsCreditorsPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@desktop/pages/dashboard").then((m) => ({ default: m.DashboardPage })),
);
const DaybookPage = lazy(() =>
  import("@desktop/pages/daybook").then((m) => ({ default: m.DaybookPage })),
);
const HawalaPage = lazy(() =>
  import("@desktop/pages/hawala").then((m) => ({ default: m.HawalaPage })),
);
const HawalaDetailPage = lazy(() =>
  import("@desktop/pages/hawala-detail").then((m) => ({
    default: m.HawalaDetailPage,
  })),
);
const NewCustomerPage = lazy(() =>
  import("@desktop/pages/new-customer").then((m) => ({
    default: m.NewCustomerPage,
  })),
);
const MovementsPage = lazy(() =>
  import("@desktop/pages/movements").then((m) => ({
    default: m.MovementsPage,
  })),
);
const OwnerCapitalPage = lazy(() =>
  import("@desktop/pages/owner-capital").then((m) => ({
    default: m.OwnerCapitalPage,
  })),
);
const ExpensesPage = lazy(() =>
  import("@desktop/pages/expenses").then((m) => ({
    default: m.ExpensesPage,
  })),
);
const EmployeesPage = lazy(() =>
  import("@desktop/pages/employees").then((m) => ({
    default: m.EmployeesPage,
  })),
);
const PartnerDetailPage = lazy(() =>
  import("@desktop/pages/partner-detail").then((m) => ({
    default: m.PartnerDetailPage,
  })),
);
const PartnersPage = lazy(() =>
  import("@desktop/pages/partners").then((m) => ({ default: m.PartnersPage })),
);
const RatesPage = lazy(() =>
  import("@desktop/pages/rates").then((m) => ({ default: m.RatesPage })),
);
const ReportsPage = lazy(() =>
  import("@desktop/pages/reports").then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import("@desktop/pages/settings").then((m) => ({ default: m.SettingsPage })),
);
const TradingDashboardPage = lazy(() =>
  import("@desktop/pages/trading/dashboard").then((m) => ({
    default: m.TradingDashboardPage,
  })),
);
const TradingHistoryPage = lazy(() =>
  import("@desktop/pages/trading/history").then((m) => ({
    default: m.TradingHistoryPage,
  })),
);
const TradingInventoryPage = lazy(() =>
  import("@desktop/pages/trading/inventory").then((m) => ({
    default: m.TradingInventoryPage,
  })),
);
const TradingLayout = lazy(() =>
  import("@desktop/pages/trading/layout").then((m) => ({
    default: m.TradingLayout,
  })),
);
const TradingTradeEditPage = lazy(() =>
  import("@desktop/pages/trading/trade-edit").then((m) => ({
    default: m.TradingTradeEditPage,
  })),
);
const VaultDetailPage = lazy(() =>
  import("@desktop/pages/vault-detail").then((m) => ({
    default: m.VaultDetailPage,
  })),
);
const VaultsPage = lazy(() =>
  import("@desktop/pages/vaults").then((m) => ({ default: m.VaultsPage })),
);
const CashPage = lazy(() =>
  import("@desktop/pages/cash").then((m) => ({ default: m.CashPage })),
);
const TransactionsPage = lazy(() =>
  import("@desktop/pages/transactions").then((m) => ({
    default: m.TransactionsPage,
  })),
);
const CalculatorPage = lazy(() =>
  import("@desktop/pages/calculator").then((m) => ({
    default: m.CalculatorPage,
  })),
);

function RouteFallback() {
  return (
    <div className="app-shell">
      <p className="muted">Loading…</p>
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function RequireLicense({ children }: { children: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<"loading" | "ok" | "need">("loading");

  useEffect(() => {
    let cancelled = false;
    void getLicenseStatus()
      .then((status) => {
        if (cancelled) return;
        setState(status.licensed ? "ok" : "need");
      })
      .catch(() => {
        if (!cancelled) setState("need");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="app-shell">
        <p className="muted">{t.license.checking}</p>
      </div>
    );
  }
  if (state === "need") {
    return <Navigate to="/activate" replace />;
  }
  return children;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, bootstrapping } = useAuth();
  if (bootstrapping) {
    return (
      <div className="app-shell">
        <p className="muted">Restoring session…</p>
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/activate" element={<LicenseActivatePage />} />
      <Route
        path="/login"
        element={
          <RequireLicense>
            <LoginPage />
          </RequireLicense>
        }
      />
      <Route
        path="/"
        element={
          <RequireLicense>
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          </RequireLicense>
        }
      >
        <Route
          index
          element={
            <Lazy>
              <DashboardPage />
            </Lazy>
          }
        />
        <Route
          path="cash"
          element={
            <Lazy>
              <CashPage />
            </Lazy>
          }
        />
        <Route
          path="customers"
          element={
            <Lazy>
              <CustomersPage />
            </Lazy>
          }
        />
        <Route
          path="customers/new"
          element={
            <Lazy>
              <NewCustomerPage />
            </Lazy>
          }
        />
        <Route
          path="customers/:id"
          element={
            <Lazy>
              <CustomerDetailPage />
            </Lazy>
          }
        />
        <Route
          path="debtors-creditors"
          element={
            <Lazy>
              <DebtorsCreditorsPage />
            </Lazy>
          }
        />
        <Route
          path="movements"
          element={
            <Lazy>
              <MovementsPage />
            </Lazy>
          }
        />
        <Route path="exchange" element={<Navigate to="/" replace />} />
        <Route
          path="hawala"
          element={
            <Lazy>
              <HawalaPage />
            </Lazy>
          }
        />
        <Route
          path="hawala/:id"
          element={
            <Lazy>
              <HawalaDetailPage />
            </Lazy>
          }
        />
        <Route
          path="partners"
          element={
            <Lazy>
              <PartnersPage />
            </Lazy>
          }
        />
        <Route
          path="partners/:id"
          element={
            <Lazy>
              <PartnerDetailPage />
            </Lazy>
          }
        />
        <Route
          path="trading"
          element={
            <Lazy>
              <TradingLayout />
            </Lazy>
          }
        >
          <Route
            index
            element={
              <Lazy>
                <TradingDashboardPage />
              </Lazy>
            }
          />
          <Route
            path="buy"
            element={<Navigate to="/trading" replace />}
          />
          <Route
            path="sell"
            element={<Navigate to="/trading" replace />}
          />
          <Route
            path="inventory"
            element={
              <Lazy>
                <TradingInventoryPage />
              </Lazy>
            }
          />
          <Route
            path="history"
            element={
              <Lazy>
                <TradingHistoryPage />
              </Lazy>
            }
          />
          <Route
            path="trades/:id"
            element={
              <Lazy>
                <TradingTradeEditPage />
              </Lazy>
            }
          />
        </Route>
        <Route
          path="capital"
          element={
            <Lazy>
              <OwnerCapitalPage />
            </Lazy>
          }
        />
        <Route
          path="expenses"
          element={
            <Lazy>
              <ExpensesPage />
            </Lazy>
          }
        />
        <Route
          path="employees"
          element={
            <Lazy>
              <EmployeesPage />
            </Lazy>
          }
        />
        <Route
          path="vaults"
          element={
            <Lazy>
              <VaultsPage />
            </Lazy>
          }
        />
        <Route
          path="vaults/:id"
          element={
            <Lazy>
              <VaultDetailPage />
            </Lazy>
          }
        />
        <Route
          path="daybook"
          element={
            <Lazy>
              <DaybookPage />
            </Lazy>
          }
        />
        <Route
          path="reports"
          element={
            <Lazy>
              <ReportsPage />
            </Lazy>
          }
        />
        <Route
          path="transactions"
          element={
            <Lazy>
              <TransactionsPage />
            </Lazy>
          }
        />
        <Route
          path="rates"
          element={
            <Lazy>
              <RatesPage />
            </Lazy>
          }
        />
        <Route
          path="calculator"
          element={
            <Lazy>
              <CalculatorPage />
            </Lazy>
          }
        />
        <Route
          path="settings"
          element={
            <Lazy>
              <SettingsPage />
            </Lazy>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
