"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/api";
import { ComplaintsSection } from "@/components/ComplaintsSection";
import { Tooltip } from "@/components/ui/Tooltip";
import { Phone, Pencil } from "lucide-react";

/**
 * 1912 complaint lookup: auto-fetches with the authenticated phone from /me,
 * with an inline override to look up a different number (e.g. a family member).
 * Used inside the Support hub.
 */
export function ComplaintLookup() {
  const { data: me } = useMe();
  const autoPhone = me?.data?.[0]?.phone;
  const [editing, setEditing] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncs derived state from async data once autoPhone resolves
  useEffect(() => { if (autoPhone && !draft) setDraft(autoPhone); }, [autoPhone, draft]);

  const activePhone = override ?? autoPhone ?? null;
  const isOverridden = override !== null && override !== autoPhone;

  const commit = () => {
    const digits = draft.replace(/\D/g, "").slice(-10);
    if (digits.length >= 10) setOverride(digits === autoPhone ? null : digits);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg bg-surface-container px-4 py-3 sm:flex-row sm:items-center">
        <Phone className="h-4 w-4 text-on-surface-variant" strokeWidth={1.75} />
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); commit(); }} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="w-full flex-1 bg-transparent font-mono text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/50"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              inputMode="numeric"
              maxLength={15}
            />
            <button type="submit" className="w-full rounded-md bg-primary-container px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed hover:brightness-110 sm:w-auto">
              Apply
            </button>
            <button type="button" onClick={() => { setDraft(autoPhone ?? ""); setEditing(false); }} className="w-full rounded-md bg-surface-container-high px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright sm:w-auto">
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="flex-1 text-[12px]">
              <span className="text-on-surface-variant">Searching for</span>{" "}
              <span className="font-mono text-on-surface">{activePhone ?? "—"}</span>
              {isOverridden ? (
                <Tooltip content={<>Account phone: <span className="font-mono">{autoPhone}</span></>}>
                  <span className="ml-2 inline-flex cursor-help items-center gap-1 rounded-full bg-secondary-container/30 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-secondary">
                    override
                  </span>
                </Tooltip>
              ) : (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">
                  from /me
                </span>
              )}
            </div>
            <button onClick={() => { setDraft(activePhone ?? ""); setEditing(true); }} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright hover:text-on-surface sm:w-auto">
              <Pencil className="h-3 w-3" /> Change number
            </button>
            {isOverridden && (
              <button onClick={() => { setOverride(null); setDraft(autoPhone ?? ""); }} className="w-full rounded-md bg-surface-container-high px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright hover:text-on-surface sm:w-auto">
                Reset
              </button>
            )}
          </>
        )}
      </div>
      <ComplaintsSection phone={activePhone} hideHeader hideFullPageLink />
    </div>
  );
}
