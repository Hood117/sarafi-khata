import { redirect } from "next/navigation";

/** Wallet management lives under Settings → System. */
export default function WalletsPage() {
  redirect("/settings/wallets");
}
