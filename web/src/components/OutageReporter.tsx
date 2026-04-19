"use client";

import { useEffect, useState, useMemo } from "react";
import { OutagePanel } from "./OutagePanel";
import { useDashboard, useSites } from "@/lib/api";
import { outageContext } from "@/lib/outage";

/**
 * Mounts the OutagePanel and wires it to the global `uppcl:open-outage` event
 * so any page or the command palette can trigger it with:
 *   window.dispatchEvent(new CustomEvent("uppcl:open-outage"))
 *
 * Safe to mount on any page — uses /sites (cheap) for the site info and
 * optionally enriches with /dashboard-derived outage context when available.
 */
export function OutageReporter() {
  const [open, setOpen] = useState(false);
  const { data: sitesResp } = useSites();
  const { data: dash } = useDashboard();

  const site = sitesResp?.data?.[0];
  const context = useMemo(() => outageContext(dash), [dash]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("uppcl:open-outage", onOpen);
    return () => window.removeEventListener("uppcl:open-outage", onOpen);
  }, []);

  if (!site) return null;

  return (
    <OutagePanel
      open={open}
      onClose={() => setOpen(false)}
      site={{
        connectionId: site.connectionId,
        tenantId: site.tenantId,
        deviceId: site.deviceId,
        address: site.address,
        pincode: site.pincode,
      }}
      context={context}
    />
  );
}
