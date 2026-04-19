"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/api";
import { ComplaintsSection } from "@/components/ComplaintsSection";
import { Tooltip } from "@/components/ui/Tooltip";
import { Phone, Pencil, AlertTriangle, MessageSquare } from "lucide-react";

/**
 * Dedicated complaints page: auto-fetches using the authenticated phone
 * from /me. A small "edit" affordance lets the user override the number
 * to look up a family member's complaints (e.g. spouse, aged parent).
 */
export default function ComplaintsPage() {
  const { data: me } = useMe();
  const autoPhone = me?.data?.[0]?.phone;
  const [editing, setEditing] = useState(false);
  const [override, setOverride] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Pre-fill draft with the auto phone when it arrives.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncs derived state from async data once autoPhone resolves
  useEffect(() => { if (autoPhone && !draft) setDraft(autoPhone); }, [autoPhone, draft]);

  const activePhone = override ?? autoPhone ?? null;
  const isOverridden = override !== null && override !== autoPhone;

  const commit = () => {
    const digits = draft.replace(/\D/g, "").slice(-10);
    if (digits.length >= 10) {
      setOverride(digits === autoPhone ? null : digits);
    }
    setEditing(false);
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            <MessageSquare className="h-3 w-3" /> 1912 complaint history
          </div>
          <h1 className="mt-1 font-mono text-[32px] font-light tracking-tight text-on-surface">
            Your complaints
          </h1>
          <p className="mt-1 max-w-[640px] text-[12px] text-on-surface-variant">
            Live status of every complaint filed with UPPCL&apos;s 1912 helpline. Auto-fetched
            using the phone number on your account — override below if you want to look
            up a different number.
          </p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("uppcl:open-outage"))}
          className="flex items-center gap-1.5 rounded-md bg-secondary-container px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-secondary-fixed transition hover:brightness-110"
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Report outage
        </button>
      </header>

      {/* Phone-used indicator with inline edit */}
      <div className="flex items-center gap-3 rounded-lg bg-surface-container-low px-4 py-3">
        <Phone className="h-4 w-4 text-on-surface-variant" strokeWidth={1.75} />
        {editing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); commit(); }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              className="flex-1 bg-transparent font-mono text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/50"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              inputMode="numeric"
              maxLength={15}
            />
            <button
              type="submit"
              className="rounded-md bg-primary-container px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed hover:brightness-110"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => { setDraft(autoPhone ?? ""); setEditing(false); }}
              className="rounded-md bg-surface-container-high px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright"
            >
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
            <button
              onClick={() => { setDraft(activePhone ?? ""); setEditing(true); }}
              className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
            >
              <Pencil className="h-3 w-3" /> Change number
            </button>
            {isOverridden && (
              <button
                onClick={() => { setOverride(null); setDraft(autoPhone ?? ""); }}
                className="rounded-md bg-surface-container-high px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
              >
                Reset
              </button>
            )}
          </>
        )}
      </div>

      {/* The same rich ComplaintsSection used on Home, without its inner header. */}
      <div className="rounded-xl bg-surface-container-low p-6">
        <ComplaintsSection phone={activePhone} hideHeader hideFullPageLink />
      </div>
    </div>
  );
}
