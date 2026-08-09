-- Report / desk VIEWs: join related tables so reports read from views, not ad-hoc dumps.
-- FKs already enforce integrity (PRAGMA foreign_keys=ON). These views expose the graph for reads.

DROP VIEW IF EXISTS v_posted_transactions;
CREATE VIEW v_posted_transactions AS
SELECT
  t.id AS transaction_id,
  t.reference,
  t.type AS transaction_type,
  t.status,
  t.valueDate AS value_date,
  t.postedAt AS posted_at,
  t.createdAt AS created_at,
  t.description,
  t.walkInName AS walk_in_name,
  t.walkInPhone AS walk_in_phone,
  t.customerId AS customer_id,
  c.code AS customer_code,
  c.fullName AS customer_name,
  c.phone AS customer_phone,
  t.createdById AS operator_id,
  u.fullName AS operator_name,
  u.username AS operator_username
FROM "Transaction" t
LEFT JOIN Customer c ON c.id = t.customerId
LEFT JOIN User u ON u.id = t.createdById
WHERE t.deletedAt IS NULL;

DROP VIEW IF EXISTS v_ledger_lines;
CREATE VIEW v_ledger_lines AS
SELECT
  le.id AS ledger_entry_id,
  le.transactionId AS transaction_id,
  t.reference AS transaction_reference,
  t.type AS transaction_type,
  t.status AS transaction_status,
  t.valueDate AS value_date,
  t.customerId AS customer_id,
  c.fullName AS customer_name,
  le.walletId AS wallet_id,
  w.name AS wallet_name,
  w.type AS wallet_type,
  w.customerId AS wallet_customer_id,
  le.currencyId AS currency_id,
  cur.code AS currency_code,
  cur.symbol AS currency_symbol,
  cur.decimalPlaces AS decimal_places,
  le.direction,
  CAST(le.amount AS TEXT) AS amount,
  le.memo,
  le.exchangeRateId AS exchange_rate_id,
  er.rate AS exchange_rate,
  bc.code AS rate_base_code,
  qc.code AS rate_quote_code
FROM LedgerEntry le
INNER JOIN "Transaction" t ON t.id = le.transactionId
INNER JOIN Wallet w ON w.id = le.walletId
INNER JOIN Currency cur ON cur.id = le.currencyId
LEFT JOIN Customer c ON c.id = t.customerId
LEFT JOIN ExchangeRate er ON er.id = le.exchangeRateId
LEFT JOIN Currency bc ON bc.id = er.baseCurrencyId
LEFT JOIN Currency qc ON qc.id = er.quoteCurrencyId
WHERE t.deletedAt IS NULL
  AND w.deletedAt IS NULL
  AND cur.deletedAt IS NULL;

DROP VIEW IF EXISTS v_hawala_report;
CREATE VIEW v_hawala_report AS
SELECT
  h.id AS hawala_id,
  h.reference,
  h.direction,
  h.status,
  h.valueDate AS value_date,
  h.createdAt AS created_at,
  CAST(h.amount AS TEXT) AS amount,
  cur.code AS currency_code,
  cur.symbol AS currency_symbol,
  h.senderName AS sender_name,
  h.senderPhone AS sender_phone,
  h.receiverName AS receiver_name,
  h.receiverPhone AS receiver_phone,
  h.partnerSarafi AS partner_name_snapshot,
  h.partnerSarafiId AS partner_id,
  p.name AS partner_catalog_name,
  p.city AS partner_city,
  p.country AS partner_country,
  h.originCity AS origin_city,
  h.originCountry AS origin_country,
  h.destinationCity AS destination_city,
  h.destinationCountry AS destination_country,
  h.customerId AS customer_id,
  cust.fullName AS customer_name,
  h.senderCustomerId AS sender_customer_id,
  sc.fullName AS sender_customer_name,
  h.receiverCustomerId AS receiver_customer_id,
  rc.fullName AS receiver_customer_name,
  h.transactionId AS transaction_id,
  t.reference AS transaction_reference,
  CAST(h.commissionAmount AS TEXT) AS partner_commission,
  CAST(h.ownCommissionAmount AS TEXT) AS own_commission,
  h.commissionSide AS commission_side,
  cash.name AS cash_wallet_name,
  clear.name AS clearing_wallet_name,
  u.fullName AS operator_name
FROM HawalaTransfer h
INNER JOIN Currency cur ON cur.id = h.currencyId
INNER JOIN Wallet cash ON cash.id = h.cashWalletId
INNER JOIN Wallet clear ON clear.id = h.clearingWalletId
LEFT JOIN PartnerSarafi p ON p.id = h.partnerSarafiId
LEFT JOIN Customer cust ON cust.id = h.customerId
LEFT JOIN Customer sc ON sc.id = h.senderCustomerId
LEFT JOIN Customer rc ON rc.id = h.receiverCustomerId
LEFT JOIN "Transaction" t ON t.id = h.transactionId
LEFT JOIN User u ON u.id = h.createdById
WHERE h.deletedAt IS NULL;

DROP VIEW IF EXISTS v_exchange_report;
CREATE VIEW v_exchange_report AS
SELECT
  t.id AS transaction_id,
  t.reference,
  t.status,
  t.valueDate AS value_date,
  t.createdAt AS created_at,
  t.description,
  t.customerId AS customer_id,
  c.fullName AS customer_name,
  t.walkInName AS walk_in_name,
  t.walkInPhone AS walk_in_phone,
  u.fullName AS operator_name,
  (
    SELECT GROUP_CONCAT(DISTINCT cur.code)
    FROM LedgerEntry le
    INNER JOIN Currency cur ON cur.id = le.currencyId
    WHERE le.transactionId = t.id
  ) AS currency_codes
FROM "Transaction" t
LEFT JOIN Customer c ON c.id = t.customerId
LEFT JOIN User u ON u.id = t.createdById
WHERE t.deletedAt IS NULL
  AND t.type = 'EXCHANGE';

DROP VIEW IF EXISTS v_customer_balances;
CREATE VIEW v_customer_balances AS
SELECT
  c.id AS customer_id,
  c.code AS customer_code,
  c.fullName AS customer_name,
  c.phone AS customer_phone,
  c.fatherName AS father_name,
  w.id AS wallet_id,
  w.name AS wallet_name,
  cur.id AS currency_id,
  cur.code AS currency_code,
  cur.symbol AS currency_symbol,
  cur.decimalPlaces AS decimal_places,
  CAST(COALESCE(SUM(
    CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
  ), 0) AS TEXT) AS balance_major
FROM Customer c
INNER JOIN Wallet w
  ON w.customerId = c.id
 AND w.type = 'CUSTOMER'
 AND w.deletedAt IS NULL
 AND w.isActive = 1
INNER JOIN LedgerEntry le ON le.walletId = w.id
INNER JOIN "Transaction" t
  ON t.id = le.transactionId
 AND t.deletedAt IS NULL
INNER JOIN Currency cur
  ON cur.id = le.currencyId
 AND cur.deletedAt IS NULL
WHERE c.deletedAt IS NULL
GROUP BY
  c.id, c.code, c.fullName, c.phone, c.fatherName,
  w.id, w.name,
  cur.id, cur.code, cur.symbol, cur.decimalPlaces
HAVING ABS(COALESCE(SUM(
  CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
), 0)) > 0;

DROP VIEW IF EXISTS v_business_cash;
CREATE VIEW v_business_cash AS
SELECT
  cur.id AS currency_id,
  cur.code AS currency_code,
  cur.symbol AS currency_symbol,
  cur.decimalPlaces AS decimal_places,
  CAST(COALESCE(SUM(
    CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
  ), 0) AS TEXT) AS balance_major
FROM Wallet w
INNER JOIN LedgerEntry le ON le.walletId = w.id
INNER JOIN Currency cur ON cur.id = le.currencyId
INNER JOIN "Transaction" t ON t.id = le.transactionId
WHERE w.deletedAt IS NULL
  AND w.isActive = 1
  AND w.type IN ('VAULT', 'TILL')
  AND cur.deletedAt IS NULL
  AND t.deletedAt IS NULL
GROUP BY cur.id, cur.code, cur.symbol, cur.decimalPlaces
HAVING ABS(COALESCE(SUM(
  CASE WHEN le.direction = 'DEBIT' THEN le.amount ELSE -le.amount END
), 0)) > 0;

DROP VIEW IF EXISTS v_period_activity;
CREATE VIEW v_period_activity AS
SELECT
  date(t.valueDate) AS activity_date,
  t.type AS transaction_type,
  COUNT(*) AS posted_count
FROM "Transaction" t
WHERE t.deletedAt IS NULL
  AND t.status = 'POSTED'
GROUP BY date(t.valueDate), t.type;

