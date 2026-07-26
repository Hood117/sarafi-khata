import {
  getTransactionFormOptions,
  getTransactionList,
  TransactionsView,
} from "@/features/transactions";

export default async function TransactionsPage() {
  const [transactions, formOptions] = await Promise.all([
    getTransactionList(),
    getTransactionFormOptions(),
  ]);

  return (
    <TransactionsView
      transactions={transactions}
      customers={formOptions.customers}
      wallets={formOptions.wallets}
      currencies={formOptions.currencies}
    />
  );
}
