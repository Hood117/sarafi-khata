/**
 * Public API for the daily book feature.
 * Import from this module only — do not reach into internal folders.
 */

export {
  buildDailyBookHref,
  dayBoundsForDateOnly,
  hasActiveDailyBookFilters,
  normalizeDailyBookFilters,
  parseDailyBookFiltersFromSearchParams,
  todayDateOnly,
  type DailyBookCurrencyOption,
  type DailyBookCustomerOption,
  type DailyBookFilterHrefInput,
  type DailyBookFilterSearchParams,
  type DailyBookFilters,
} from "@/features/daily-book/domain/daily-book-filters";

export {
  buildDailyBookSummary,
  type DailyBookCurrencyTotal,
  type DailyBookOperationCard,
  type DailyBookSummary,
} from "@/features/daily-book/domain/daily-book-summary";

export { getDailyBookPageData } from "@/features/daily-book/services/get-daily-book-page-data";
export { DailyBookView } from "@/features/daily-book/components/daily-book-view";
export { DailyBookFiltersForm } from "@/features/daily-book/components/daily-book-filters";
export { DailyBookSummaryCards } from "@/features/daily-book/components/daily-book-summary-cards";
