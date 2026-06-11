import { redirect } from "next/navigation";

// 1912 complaints merged into the Support hub.
export default function ComplaintsRedirect() {
  redirect("/support");
}
