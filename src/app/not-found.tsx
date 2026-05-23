import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-(--color-void) text-on-surface">
      <div className="text-center">
        <div className="font-mono text-[72px] font-light tracking-tight text-on-surface-variant/30">
          404
        </div>
        <div className="mt-2 font-mono text-[16px] text-on-surface">
          Page not found
        </div>
        <p className="mt-3 text-[13px] text-on-surface-variant">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-surface-container-high px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
