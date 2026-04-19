"use client";

import { useState } from "react";
import {
  Phone,
  MessageSquare,
  Globe,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Zap,
} from "lucide-react";
import { SidePanel } from "@/components/ui/SidePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { OutageContext } from "@/lib/outage";

interface Props {
  open: boolean;
  onClose: () => void;
  site: {
    connectionId: string;
    tenantId: string;
    deviceId: string;
    address?: string;
    pincode?: string;
    phone?: string;
  };
  context?: OutageContext;
}

/** Public UPPCL complaint channels. Not secrets; on every bill. */
const HELPLINE_TEL = "1912";                // 24×7 toll-free
const TOLL_FREE = "1800-180-0440";          // alternative toll-free
const COMPLAINT_SMS_NUMBER = "5616195";     // SMS shortcode
const WEB_COMPLAINT_PORTAL = "https://appsavy.com/coreapps/UI/Form?FormId=6444";

export function OutagePanel({ open, onClose, site, context }: Props) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  const complaintText = [
    `UPPCL Complaint — no power supply`,
    ``,
    `Connection ID: ${site.connectionId}`,
    `Installation / meter: ${site.deviceId}`,
    `DISCOM: ${site.tenantId}`,
    site.address ? `Address: ${site.address}` : undefined,
    site.pincode ? `PIN: ${site.pincode}` : undefined,
    site.phone ? `Phone: ${site.phone}` : undefined,
    ``,
    `Reason: Power supply unavailable at this connection.`,
    `Time reported: ${new Date().toLocaleString("en-IN")}`,
  ].filter(Boolean).join("\n");

  const smsTemplate = `NO POWER ${site.connectionId} ${site.tenantId?.toUpperCase() ?? ""}`;

  const copyComplaint = async () => {
    try {
      await navigator.clipboard.writeText(complaintText);
      setCopied(true);
      push("Complaint text copied", { kind: "success" });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      push("Clipboard blocked — select & copy manually", { kind: "error" });
    }
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      width={520}
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-secondary" />
          Report power outage
        </span>
      }
      subtitle="Use this when lights are actually out — there's no reliable auto-detection"
    >
      <div className="space-y-5">
        {/* Honest note about detection */}
        <div className="flex items-start gap-3 rounded-lg bg-surface-container p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />
          <div className="text-[12px] leading-relaxed text-on-surface-variant">
            <span className="text-on-surface">Why no auto-detect?</span> UPPCL&apos;s
            upstream only exposes per-day totals with a 24–30 h lag and doesn&apos;t
            publish a meter-heartbeat endpoint. Any automatic &quot;outage&quot; banner
            would false-positive on vacation days or late bill updates. So this
            stays a manual button — when you hit it, we know you actually have no power.
          </div>
        </div>

        {/* Raw data context (informational only — not a claim) */}
        {context && context.lastReportAt && (
          <div className="rounded-lg bg-surface-container-low p-4">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
              For reference · meter feed
            </div>
            <div className="space-y-1.5 font-mono text-[11px]">
              <Kv k="last usage report"
                  v={`${new Date(context.lastReportAt).toLocaleString("en-IN")} (${Math.round(context.hoursSinceReport)} h ago)`} />
              {context.yesterdayKwh !== null && (
                <Kv k="yesterday's kWh" v={`${context.yesterdayKwh.toFixed(2)} kWh`} />
              )}
              {context.weeklyAvgKwh !== null && (
                <Kv k="7-day avg kWh" v={`${context.weeklyAvgKwh.toFixed(2)} kWh`} />
              )}
              {context.dropPct !== null && (
                <Kv k="Δ vs avg" v={`${context.dropPct >= 0 ? "−" : "+"}${Math.abs(context.dropPct)}%`} />
              )}
            </div>
            <div className="mt-2 text-[10px] text-on-surface-variant/70">
              These are lagging indicators. Use them as context, not confirmation.
            </div>
          </div>
        )}

        {/* Three big actions */}
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
            Lodge the complaint
          </div>

          <ActionRow
            href={`tel:${HELPLINE_TEL}`}
            accent="primary"
            icon={<Phone className="h-5 w-5" />}
            title="Call 1912"
            body={<>UPPCL 24×7 helpline · Hindi &amp; English. Fastest path.</>}
            cta="Dial"
          />
          <ActionRow
            href={`sms:${COMPLAINT_SMS_NUMBER}?body=${encodeURIComponent(smsTemplate)}`}
            accent="secondary"
            icon={<MessageSquare className="h-5 w-5" />}
            title={`SMS ${COMPLAINT_SMS_NUMBER}`}
            body={<>Pre-filled: <span className="font-mono text-on-surface">{smsTemplate}</span></>}
            cta="Compose"
          />
          <ActionRow
            href={WEB_COMPLAINT_PORTAL}
            accent="muted"
            icon={<Globe className="h-5 w-5" />}
            title="Online complaint portal"
            body={<>uppclonline.com · enter the consumer details below manually.</>}
            cta="Open"
          />
          <ActionRow
            href={`tel:${TOLL_FREE}`}
            accent="muted"
            icon={<Phone className="h-5 w-5" />}
            title={`Toll-free · ${TOLL_FREE}`}
            body={<>Alternative number if 1912 is busy.</>}
            cta="Dial"
          />
        </div>

        {/* Copyable complaint text */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
              Copy-ready complaint text
            </div>
            <Tooltip content="Copy to clipboard — paste into any form / email">
              <button
                onClick={copyComplaint}
                className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-2.5 py-1 text-[11px] font-semibold text-on-surface transition hover:bg-surface-bright"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </Tooltip>
          </div>
          <pre className="whitespace-pre-wrap rounded-md bg-surface-container p-3 font-mono text-[11px] leading-relaxed text-on-surface">
{complaintText}
          </pre>
        </div>

        {/* Instructions for the phone call */}
        <div className="rounded-lg bg-surface-container-low p-4">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
            <Zap className="h-3 w-3" /> What to say on 1912
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-[12px] text-on-surface-variant marker:text-primary-fixed-dim">
            <li>&quot;Power supply not available at my connection.&quot;</li>
            <li>Give consumer ID: <span className="font-mono text-on-surface">{site.connectionId}</span></li>
            <li>Mention DISCOM: <span className="font-mono text-on-surface">{site.tenantId}</span></li>
            <li>Give approximate outage start time + address / pincode.</li>
            <li>Note the complaint number they issue — you&apos;ll need it to follow up.</li>
          </ol>
        </div>

        {/* Coming-soon footer */}
        <div className="rounded-lg border border-dashed border-white/10 p-3 text-[11px] text-on-surface-variant/80">
          <span className="text-primary-fixed-dim">Coming soon:</span>{" "}
          one-click online complaint submission once we reverse-engineer the
          complaint portal&apos;s API. Share a HAR of
          https://uppclonline.com/ and we&apos;ll wire it up.
        </div>
      </div>
    </SidePanel>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-1.5 last:border-0">
      <span className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</span>
      <span className="text-on-surface">{v}</span>
    </div>
  );
}

function ActionRow({
  href,
  accent,
  icon,
  title,
  body,
  cta,
}: {
  href: string;
  accent: "primary" | "secondary" | "muted";
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  cta: string;
}) {
  const tone = {
    primary:   { bg: "bg-primary-container",    fg: "text-on-primary-fixed" },
    secondary: { bg: "bg-secondary-container",  fg: "text-on-secondary-fixed" },
    muted:     { bg: "bg-surface-container-high", fg: "text-on-surface" },
  }[accent];

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="group flex items-center gap-4 rounded-lg bg-surface-container p-4 transition-colors hover:bg-surface-container-high"
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", tone.bg, tone.fg)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-on-surface">{title}</div>
        <div className="mt-0.5 text-[11px] text-on-surface-variant">{body}</div>
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant transition-transform group-hover:translate-x-1">
        {cta} →
      </div>
    </a>
  );
}
