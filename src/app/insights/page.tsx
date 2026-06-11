import { redirect } from "next/navigation";

// Insights was dissolved into the domain tabs: power quality → Meter, tariff →
// Bills, carbon/appliance/tips → Usage. Land on Usage (the consumption home).
export default function InsightsRedirect() {
  redirect("/analytics");
}
