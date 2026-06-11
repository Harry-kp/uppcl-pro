"use client";

import { useDashboard } from "@/lib/api";
import { BillsPrepaid } from "@/components/bills/BillsPrepaid";
import { BillsPostpaid } from "@/components/bills/BillsPostpaid";

// Bills & payments — reshapes by meter type. Prepaid: daily-bill cost analytics +
// recharge planner. Postpaid: monthly invoices + official PDF + tariff + payments.
export default function LedgerPage() {
  const { data } = useDashboard();
  if (data?.site.connectionType === "postpaid") return <BillsPostpaid />;
  return <BillsPrepaid />;
}
