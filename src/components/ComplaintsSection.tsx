"use client";

import { useState } from "react";
import Link from "next/link";
import { useMe, useMyComplaints, ComplaintDetail } from "@/lib/api";
import { SidePanel } from "@/components/ui/SidePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Phone,
  Copy,
  Check,
  ArrowRight,
  User,
  MapPin,
  Radio,
  Clock,
  FileText,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

/**
 * UPPCL 1912 "File a complaint" form, behind the anonymous-session bootstrap
 * URL so it actually loads instead of redirecting to Logout. PROJECTID=119 /
 * FORMID=6444 is the NO-SUPPLY complaint form. Reachable from the
 * OutagePanel's "Online complaint portal" row.
 */
export const FILE_COMPLAINT_URL =
  "https://appsavy.com/coreapps/UI/Anonymous?PROJECTID=119&FORMID=6444";

interface ComplaintsSectionProps {
  /** Override the auto-detected phone (from /me). */
  phone?: string | null;
  /** Hide the header (caller is rendering its own). */
  hideHeader?: boolean;
  /** Hide the "Full page →" link (we're already there). */
  hideFullPageLink?: boolean;
}

/**
 * Complaints viewer, used both on the Home dashboard section and on the
 * dedicated /complaints page. Auto-pulls the phone from /me unless `phone`
 * is explicitly passed; sorts newest-first; rich compact rows with drill-in.
 */
export function ComplaintsSection({ phone: override, hideHeader, hideFullPageLink }: ComplaintsSectionProps = {}) {
  const { data: me } = useMe();
  const autoPhone = me?.data?.[0]?.phone;
  const phone = override ?? autoPhone;
  const { data, error, isLoading } = useMyComplaints(phone);

  const [selected, setSelected] = useState<ComplaintDetail | null>(null);

  if (!phone) return null; // wait for /me

  const complaints = data?.complaints ?? [];
  const openCount = complaints.filter((c) => c.is_open).length;

  return (
    <section className={cn(hideHeader ? "" : "rounded-xl bg-surface-container-low p-6")}>
      {!hideHeader && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              <MessageSquare className="h-3 w-3" /> 1912 Complaint history
            </div>
            <h2 className="mt-1 font-mono text-[18px] text-on-surface">
              Your complaints
              {complaints.length > 0 && (
                <span className="ml-2 font-mono text-[12px] text-on-surface-variant">
                  · {complaints.length} on record
                  {openCount > 0 && (
                    <span className="ml-1 text-secondary">· {openCount} open</span>
                  )}
                </span>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("uppcl:open-outage"))}
              className="flex items-center gap-1.5 rounded-md bg-secondary-container px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-secondary-fixed transition hover:brightness-110"
            >
              <AlertTriangle className="h-3 w-3" /> Report outage
            </button>
            {!hideFullPageLink && (
              <Link
                href="/complaints"
                className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant transition hover:bg-surface-bright hover:text-on-surface"
              >
                Full page <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* States */}
      {error && (
        <div className="rounded-lg bg-[rgba(255,90,90,0.10)] px-4 py-3 text-[12px] text-error">
          Complaint portal unreachable: {(error as Error).message}
        </div>
      )}
      {isLoading && <SkeletonRows />}
      {!isLoading && !error && complaints.length === 0 && (
        <EmptyState phone={phone} />
      )}
      {!isLoading && !error && complaints.length > 0 && (
        <div className="space-y-2">
          {complaints.map((c) => (
            <ComplaintRow key={c.data_id} c={c} onOpen={() => setSelected(c)} />
          ))}
        </div>
      )}

      {/* Drill-in side panel for the rare case */}
      <DetailPanel c={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

/* ─────────────────────────────── compact row ─────────────────────────────── */

function ComplaintRow({ c, onOpen }: { c: ComplaintDetail; onOpen: () => void }) {
  const filed = parseAppsavyDate(c.entry_date);
  const closed = parseAppsavyDate(c.closing_date);
  const ago = filed ? formatRelative(filed) : null;
  const resolutionDur = filed && closed ? formatDuration(closed.getTime() - filed.getTime()) : null;

  const officers = [
    { label: "JE",  name: c.je_name,  phone: cleanPhone(c.je_mobile) },
    { label: "AE",  name: c.ae_name,  phone: cleanPhone(c.ae_mobile) },
    { label: "XEN", name: c.xen_name, phone: cleanPhone(c.xen_mobile) },
  ].filter((o) => o.name || o.phone);

  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-lg bg-surface-container p-4 text-left transition-colors hover:bg-surface-container-high"
    >
      {/* Line 1: icon + date + sub-type + status pill */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            c.is_open
              ? "bg-secondary-container/40 text-secondary"
              : "bg-surface-container-lowest text-primary-fixed-dim"
          )}
        >
          {c.is_open ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className="font-mono text-[12px] text-on-surface-variant">
                {filed ? filed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                {filed && (
                  <span className="ml-1 text-on-surface-variant/70">
                    · {filed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </span>
              <span className="ml-3 text-[14px] font-medium text-on-surface">
                {c.sub_type ?? "—"}
              </span>
              <span className="ml-2 text-[11px] text-on-surface-variant">
                {c.type}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em]",
                c.is_open
                  ? "bg-secondary-container/30 text-secondary"
                  : "bg-surface-container-lowest text-primary-fixed-dim"
              )}
            >
              {c.is_open ? "open" : "closed"}
            </span>
          </div>

          {/* Line 2: complaint# + age + resolution time */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-on-surface-variant">
            <span className="font-mono text-on-surface-variant">{c.complaint_no}</span>
            {ago && <span>· filed {ago}</span>}
            {resolutionDur && <span>· resolved in <span className="text-primary-fixed-dim">{resolutionDur}</span></span>}
            {c.source && <span>· via {c.source}</span>}
          </div>

          {/* Line 3: user remarks */}
          {c.remarks && (
            <div className="mt-2 flex gap-2 text-[12px] leading-snug text-on-surface-variant">
              <FileText className="mt-0.5 h-3 w-3 shrink-0 text-on-surface-variant/50" />
              <span className="line-clamp-2">{c.remarks}</span>
            </div>
          )}

          {/* Line 4: closing remarks (resolution) */}
          {c.closing_remarks && (
            <div className="mt-1.5 flex gap-2 text-[12px] leading-snug text-primary-fixed-dim/90">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2">{c.closing_remarks}</span>
            </div>
          )}

          {/* Line 5: officer chain with one-tap call */}
          {officers.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              {officers.map((o) => (
                <OfficerChip key={o.label} label={o.label} name={o.name} phone={o.phone} />
              ))}
            </div>
          )}
        </div>

        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-on-surface-variant/50 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
}

function OfficerChip({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  const tooltip = (
    <div>
      <div className="font-mono text-on-surface">{label}</div>
      <div className="text-on-surface-variant">{name ?? "—"}</div>
      {phone && <div className="font-mono text-on-surface-variant">{phone}</div>}
    </div>
  );
  // Stop the row-click from bubbling when user taps the call icon.
  const call = (e: React.MouseEvent) => { e.stopPropagation(); };
  return (
    <Tooltip content={tooltip}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest px-2 py-1 text-[10px]">
        <span className="font-mono text-on-surface-variant">{label}</span>
        <span className="max-w-[120px] truncate text-on-surface">{name ?? "—"}</span>
        {phone && (
          <a
            href={`tel:${phone}`}
            onClick={call}
            className="rounded-full bg-primary-container/20 p-0.5 text-primary-fixed-dim hover:bg-primary-container hover:text-on-primary-fixed"
            aria-label={`Call ${label}`}
          >
            <Phone className="h-3 w-3" />
          </a>
        )}
      </span>
    </Tooltip>
  );
}

/* ─────────────────────────────── drill-in panel ─────────────────────────── */

function DetailPanel({ c, onClose }: { c: ComplaintDetail | null; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!c) return null;
  const copy = async (v: string, id: string) => {
    try { await navigator.clipboard.writeText(v); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch {}
  };
  return (
    <SidePanel
      open={!!c}
      onClose={onClose}
      width={560}
      title={`Complaint ${c.complaint_no}`}
      subtitle={c.sub_type ? `${c.sub_type} · ${c.type}` : undefined}
    >
      <div className="space-y-4 text-[12px]">
        <KvBlock k="Status" v={
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
            c.is_open ? "bg-secondary-container/30 text-secondary" : "bg-surface-container-lowest text-primary-fixed-dim"
          )}>
            {c.is_open ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {c.status}
          </span>
        } />
        <KvBlock k="Filed"     v={c.entry_date} />
        <KvBlock k="Resolved"  v={c.closing_date ?? (c.is_open ? "pending" : "—")} />
        <KvBlock k="What was reported" v={<p className="text-on-surface">{c.remarks ?? "—"}</p>} block />
        {c.closing_remarks && (
          <KvBlock k="Resolution" v={<p className="text-on-surface">{c.closing_remarks}</p>} block />
        )}

        <div className="rounded-lg bg-surface-container p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
            <User className="h-3 w-3" /> Officer chain
          </div>
          <Officer role="JE (Junior Engineer)"     name={c.je_name}  phone={cleanPhone(c.je_mobile)}  copied={copied} copy={copy} />
          <Officer role="AE (Assistant Engineer)"  name={c.ae_name}  phone={cleanPhone(c.ae_mobile)}  copied={copied} copy={copy} />
          <Officer role="XEN (Executive Engineer)" name={c.xen_name} phone={cleanPhone(c.xen_mobile)} copied={copied} copy={copy} />
        </div>

        <div className="rounded-lg bg-surface-container p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
            <Radio className="h-3 w-3" /> Grid
          </div>
          <KvBlock k="Substation"   v={c.substation} />
          <KvBlock k="Subdivision"  v={c.subdivision} />
          <KvBlock k="Assigned to"  v={c.assigned_to} />
        </div>

        <div className="rounded-lg bg-surface-container p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
            <MapPin className="h-3 w-3" /> Consumer on record
          </div>
          <KvBlock k="Name"       v={c.consumer_name} />
          <KvBlock k="Mobile"     v={c.mobile_no} />
          <KvBlock k="Connection" v={c.customer_account} mono />
          <KvBlock k="Address"    v={c.address} />
        </div>

        <div className="flex items-center gap-2 rounded-md bg-surface-container p-2 text-[10px] font-mono text-on-surface-variant">
          <Clock className="h-3 w-3" />
          source {c.source ?? "—"} · data_id {c.data_id}
          <button
            onClick={() => copy(c.complaint_no, "cno")}
            className="ml-auto rounded bg-surface-container-high px-2 py-0.5 text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
          >
            {copied === "cno" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </SidePanel>
  );
}

function Officer({ role, name, phone, copied, copy }: {
  role: string;
  name: string | null;
  phone: string | null;
  copied: string | null;
  copy: (v: string, id: string) => void;
}) {
  if (!name && !phone) return <div className="pb-1.5 text-[11px] text-on-surface-variant/70">{role}: not assigned</div>;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.14em] text-on-surface-variant">{role}</div>
        <div className="mt-0.5 truncate text-[12px] text-on-surface">{name ?? "—"}</div>
      </div>
      {phone && (
        <div className="flex items-center gap-1">
          <a href={`tel:${phone}`} className="flex items-center gap-1 rounded-md bg-primary-container px-2 py-1 text-[10px] font-semibold text-on-primary-fixed">
            <Phone className="h-3 w-3" /> Call
          </a>
          <button onClick={() => copy(phone, role)} className="rounded-md bg-surface-container-high px-2 py-1 font-mono text-[10px] text-on-surface-variant hover:bg-surface-bright">
            {copied === role ? <Check className="h-3 w-3" /> : phone}
          </button>
        </div>
      )}
    </div>
  );
}

function KvBlock({ k, v, mono, block }: { k: string; v: React.ReactNode; mono?: boolean; block?: boolean }) {
  if (block) {
    return (
      <div className="rounded-md bg-surface-container p-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</div>
        <div className="text-[12px] leading-relaxed">{v}</div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">{k}</span>
      <span className={cn("text-right", mono ? "font-mono text-on-surface" : "text-on-surface")}>{v || "—"}</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-container" />
      ))}
    </div>
  );
}

function EmptyState({ phone }: { phone: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-surface-container p-4 text-[12px] text-on-surface-variant">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-fixed-dim" />
      <div>
        No 1912 complaints filed from <span className="font-mono text-on-surface">{phone}</span>.
        If you need to report an outage, use the <span className="text-on-surface">Power out?</span> button above.
      </div>
    </div>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

/** Appsavy returns "18/04/2026 10:56:30 PM" — parse into a real Date. */
function parseAppsavyDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Common forms: "18/04/2026 10:56:30 PM", "18-04-2026 22:56:30", "18/04/2026"
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!m1) return null;
  const [, d, m, y, H, Mi, Se, ampm] = m1;
  let hh = H ? parseInt(H) : 0;
  if (ampm) {
    if (ampm.toUpperCase() === "PM" && hh < 12) hh += 12;
    if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;
  }
  const dt = new Date(
    parseInt(y), parseInt(m) - 1, parseInt(d),
    hh, Mi ? parseInt(Mi) : 0, Se ? parseInt(Se) : 0
  );
  return isNaN(dt.getTime()) ? null : dt;
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} mo ago`;
}

function formatDuration(ms: number): string {
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ${mins % 60} min`;
  const days = Math.floor(hrs / 24);
  return `${days} d ${hrs % 24} h`;
}

function cleanPhone(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 10 ? digits : null;
}
