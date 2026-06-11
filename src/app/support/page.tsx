"use client";

import { useMemo } from "react";
import {
  useTenantPreferences,
  useDowntime,
  useMeterAlarms,
  useNotifications,
  useTickets,
  type DiscomDetails,
} from "@/lib/api";
import { formatRelative } from "@/lib/utils";
import { ComplaintLookup } from "@/components/ComplaintLookup";
import {
  LifeBuoy, Phone, MessageCircle, Mail, Megaphone, Siren, BellRing, Ticket,
  MapPin, MessageSquare, ArrowUpRight,
} from "lucide-react";

export default function SupportPage() {
  const { data: prefs } = useTenantPreferences();
  const { data: downtime } = useDowntime();
  const { data: alarms } = useMeterAlarms();
  const { data: notifications } = useNotifications();
  const { data: tickets } = useTickets("all");

  const discom: DiscomDetails = prefs?.data?.discomDetails ?? {};
  const downBody = downtime?.data?.body || downtime?.data?.title;

  const phone = (discom.customerCareNumber || discom.helplineNumber || "1912").trim();
  const waDigits = (discom.whatsappNumber || "").replace(/[^0-9]/g, "");
  const email = discom.email || "";

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div className="px-1">
        <h1 className="text-[15px] text-on-surface">Support</h1>
        <p className="mt-0.5 text-[12px] text-on-surface-variant">
          Reach {discom.alias || discom.title || "your DISCOM"}, report an outage, and track every meter event in one place.
        </p>
      </div>

      {/* DOWNTIME BANNER */}
      {downBody && (
        <div className="flex items-start gap-3 rounded-xl bg-secondary-container/20 p-4">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary">Service notice</div>
            <div className="mt-1 text-[13px] text-on-surface">{downBody}</div>
          </div>
        </div>
      )}

      {/* CONTACT HUB */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <LifeBuoy className="h-3 w-3" /> Get help
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ContactCard
            icon={<Phone className="h-4 w-4" />}
            label="Call helpline"
            value={phone}
            href={`tel:${phone}`}
          />
          <ContactCard
            icon={<MessageCircle className="h-4 w-4" />}
            label="WhatsApp"
            value={discom.whatsappNumber || "—"}
            href={waDigits ? `https://wa.me/${waDigits}` : undefined}
            external
          />
          <ContactCard
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={email || "—"}
            href={email ? `mailto:${email}` : undefined}
          />
        </div>

        <div className="mt-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("uppcl:open-outage"))}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright sm:w-auto"
          >
            <Siren className="h-3.5 w-3.5" /> Report power outage
          </button>
        </div>

        {discom.address && (
          <div className="mt-4 flex items-start gap-2 text-[11px] text-on-surface-variant">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {discom.address}
          </div>
        )}
      </section>

      {/* UNIFIED EVENT FEED */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FeedSection
          icon={<Siren className="h-3 w-3" />}
          title="Meter alarms"
          rows={alarms?.data ?? []}
          empty="No meter alarms — your connection is healthy."
        />
        <FeedSection
          icon={<BellRing className="h-3 w-3" />}
          title="Notifications"
          rows={notifications?.data ?? []}
          empty="No notifications right now."
        />
        <FeedSection
          icon={<Ticket className="h-3 w-3" />}
          title="Service tickets"
          rows={tickets?.data ?? []}
          empty="No open service tickets."
        />
      </div>

      {/* 1912 COMPLAINTS */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <MessageSquare className="h-3 w-3" /> 1912 complaint history
        </div>
        <p className="mt-1 text-[11px] text-on-surface-variant">
          Live status of complaints filed with UPPCL&apos;s 1912 helpline — auto-fetched from your account phone.
        </p>
        <div className="mt-4">
          <ComplaintLookup />
        </div>
      </section>
    </div>
  );
}

function ContactCard({
  icon, label, value, href, external,
}: { icon: React.ReactNode; label: string; value: string; href?: string; external?: boolean }) {
  const body = (
    <>
      <span className="rounded-md bg-surface-container p-2 text-primary-fixed-dim">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">{label}</div>
        <div className="mt-0.5 truncate font-mono text-[13px] text-on-surface">{value}</div>
      </div>
      {href && <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-on-surface-variant/60" />}
    </>
  );
  const cls = "group flex items-center gap-3 rounded-lg bg-surface-container-high p-3 transition hover:bg-surface-bright";
  if (!href) return <div className={cls + " opacity-60"}>{body}</div>;
  return (
    <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {body}
    </a>
  );
}

/** Defensive renderer for the (currently empty for most meters) event endpoints. */
function FeedSection({
  icon, title, rows, empty,
}: { icon: React.ReactNode; title: string; rows: Record<string, unknown>[]; empty: string }) {
  const items = useMemo(() => rows.map(pickRow), [rows]);
  return (
    <section className="rounded-xl bg-surface-container-low p-5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
        {icon} {title}
        {items.length > 0 && <span className="ml-auto font-mono text-on-surface">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div className="mt-4 text-[12px] text-on-surface-variant/80">{empty}</div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg bg-surface-container p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] text-on-surface">{it.title}</div>
                {it.date && <div className="shrink-0 font-mono text-[10px] text-on-surface-variant">{it.date}</div>}
              </div>
              {it.subtitle && <div className="mt-1 text-[11px] text-on-surface-variant">{it.subtitle}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function pickRow(r: Record<string, unknown>): { title: string; subtitle?: string; date?: string } {
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : undefined);
  const title =
    s("title") || s("alarmType") || s("type") || s("subject") || s("message") || s("complaint_no") || "Event";
  const subtitle = s("description") || s("body") || s("status") || s("sub_type") || s("message");
  const rawDate = s("createdAt") || s("created_at") || s("date") || s("entry_date") || s("startDate");
  return {
    title,
    subtitle: subtitle === title ? undefined : subtitle,
    date: rawDate ? formatRelative(rawDate) : undefined,
  };
}
