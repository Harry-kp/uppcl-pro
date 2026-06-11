"use client";

import { useSites } from "@/lib/api";
import { BillsPrepaid } from "@/components/bills/BillsPrepaid";
import { BillsPostpaid } from "@/components/bills/BillsPostpaid";

// Bills & payments — reshapes by meter type. Prepaid: daily-bill cost analytics +
// recharge planner. Postpaid: monthly invoices + official PDF + tariff + payments.
// Decide off the lightweight site/search (not the heavy dashboard composite) and
// hold a skeleton until it resolves, so we never render the wrong (empty) view.
export default function LedgerPage() {
  const { data, error, isLoading } = useSites();
  const site = data?.data?.[0];

  if (error) return <BillsError message={(error as Error).message} />;
  if (isLoading || !site) return <BillsSkeleton />;

  return site.connectionType === "postpaid" ? <BillsPostpaid /> : <BillsPrepaid />;
}

function BillsSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div className="rounded-xl bg-surface-container-low p-6">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton mt-4 h-10 w-48 rounded" />
        <div className="skeleton mt-3 h-3 w-64 rounded" />
      </div>
      <div className="rounded-xl bg-surface-container-low p-6">
        <div className="skeleton h-3 w-40 rounded" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton mt-3 h-6 w-full rounded" />
        ))}
      </div>
    </div>
  );
}

function BillsError({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl bg-surface-container-low p-8 text-center">
      <div className="font-mono text-[20px] text-secondary">Bills unavailable</div>
      <p className="mt-3 text-[13px] text-on-surface-variant">{message}</p>
      <p className="mt-4 font-mono text-[11px] text-on-surface-variant/70">
        Try signing out and back in if this persists.
      </p>
    </div>
  );
}
