import { ArrowRight, Smartphone } from "lucide-react";

/** The website is discontinued in favour of the Android app. Its API routes stay live (the app uses /api/complaints). */
const APP_URL = "https://github.com/Harry-kp/uppcl-pro-app/releases/latest";

export function MovedBanner() {
  return (
    <div role="status" className="bg-primary-container text-on-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-[13px]">
        <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <b>UPPCL Pro is now an Android app</b> — in-app bill payment, one-tap complaints, Hindi.{" "}
          This website is no longer updated.
        </span>
        <a href={APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          Get the app <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
