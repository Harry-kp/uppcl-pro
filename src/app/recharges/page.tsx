import { redirect } from "next/navigation";

// Recharges merged into Bills (the recharge planner lives in the prepaid view).
export default function RechargesRedirect() {
  redirect("/ledger");
}
