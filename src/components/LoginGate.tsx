"use client";

import { useState, FormEvent } from "react";
import { mutate as swrMutate } from "swr";
import Link from "next/link";
import {
  Zap,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  User,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Moon,
  Sun,
} from "lucide-react";
import { login, ProxyError } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useTranslations } from "next-intl";
import { useLocale } from "@/components/I18nProvider";

/**
 * Full-bleed auth gate. Rendered by <Shell> when the proxy reports
 * `authenticated: false` or is unreachable. Intentionally ignores the
 * sidebar/topbar — a clean entry screen reads as "you're outside the
 * app" better than greyed-out nav.
 */
export function LoginGate({ proxyUnreachable }: { proxyUnreachable?: string }) {
  const { push } = useToast();
  const t = useTranslations("login");
  const { locale, setLocale } = useLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    // No preference saved — follow system
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
  }

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErr(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
      // Re-run every SWR cache so the rest of the app sees the new JWT.
      await swrMutate(() => true);
      push("Signed in", { kind: "success" });
      // No redirect — the gate dismounts as soon as /health reports authenticated.
    } catch (e) {
      const msg = e instanceof ProxyError ? e.message : (e as Error).message || "Login failed";
      setErr(msg);
      push(msg, { kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-(--color-void) text-on-surface">
      {/* Top wordmark */}
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary-container/25 text-primary-fixed-dim">
            <Zap className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="leading-none">
            <div className="font-mono text-[13px] tracking-[0.04em] text-on-surface">UPPCL Pro</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.26em] text-on-surface-variant/60">Kinetic Vault</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocale(locale === "en" ? "hi" : "en")}
            className="rounded-md px-2 py-1 font-mono text-[11px] font-semibold text-on-surface-variant/70 transition hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Toggle language"
          >
            {locale === "en" ? "हिंदी" : "EN"}
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md p-2 text-on-surface-variant/70 transition hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Toggle theme"
          >
            {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <Link
            href="https://github.com/Harry-kp/uppcl-pro.git"
            target="_blank"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-on-surface-variant/70 transition hover:text-on-surface"
          >
            {t("source")} <ExternalLink className="h-3 w-3" strokeWidth={2} />
          </Link>
        </div>
      </header>

      {/* Centred split */}
      <div className="grid flex-1 place-items-center px-6 pb-12">
        <div className="grid w-full max-w-[980px] items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* ── Pitch side ───────────────────────────────────────────── */}
           <div className="hidden flex-col gap-6 lg:flex">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary-fixed-dim">
                {t("tagline")}
              </div>
              <h1 className="font-mono text-[34px] leading-[1.1] text-on-surface">
                {t("headline_1")}<br />
                {t("headline_2")}
              </h1>
              <p className="mt-4 max-w-[380px] text-[13px] leading-relaxed text-on-surface-variant">
                {t("description")}
              </p>
            </div>

            {/* Trust banner */}
            <div className="rounded-lg border border-primary-fixed-dim/20 bg-primary-container/10 px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-primary-fixed-dim">
                <ShieldCheck className="h-4 w-4" strokeWidth={2} />
                {t("trust_banner")}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-on-surface-variant">
                {t("trust_sub")}
              </p>
              <Link
                href="https://github.com/Harry-kp/uppcl-pro#security--privacy"
                target="_blank"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-fixed-dim hover:underline"
              >
                {t("trust_link")} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <ul className="space-y-3">
              <Pitch icon={<LockKeyhole className="h-3.5 w-3.5" strokeWidth={2.25} />}>
                {t.rich("pitch_1", { b: (chunks) => <strong>{chunks}</strong> })}
              </Pitch>
              <Pitch icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} />}>
                {t.rich("pitch_2", { b: (chunks) => <strong>{chunks}</strong> })}
              </Pitch>
              <Pitch icon={<Zap className="h-3.5 w-3.5" strokeWidth={2.25} />}>
                {t.rich("pitch_3", { code: (chunks) => <code className="rounded bg-surface-container-low px-1 font-mono text-[11px]">{chunks}</code> })}
              </Pitch>
            </ul>

            <div className="mt-2 border-t border-white/[0.04] pt-4 font-mono text-[11px] text-on-surface-variant/70">
              {t("footer_line")}
            </div>
          </div>

          {/* ── Form side ────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-surface-container-low p-8 shadow-ambient">
            {proxyUnreachable ? (
              <ProxyDownPanel message={proxyUnreachable} />
            ) : (
              <>
                <div className="mb-6">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-on-surface-variant">
                    {t("welcome")}
                  </div>
                  <div className="mt-1 font-mono text-[22px] text-on-surface">{t("sign_in")}</div>
                  <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">
                    {t("sign_in_desc")}{" "}
                    <Link
                      href="https://uppcl.sem.jio.com/uppclsmart/"
                      target="_blank"
                      className="text-primary-fixed-dim underline-offset-2 hover:underline"
                    >
                      UPPCL SMART app
                    </Link>.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-4" autoComplete="on">
                  <Field
                    label={t("username")}
                    hint={t("username_hint")}
                    icon={<User className="h-3.5 w-3.5" />}
                  >
                    <input
                      name="username"
                      type="text"
                      inputMode="numeric"
                      autoComplete="username"
                      autoFocus
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t("username_placeholder")}
                      className="w-full bg-transparent font-mono text-[14px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                    />
                  </Field>

                  <Field
                    label={t("password")}
                    icon={<LockKeyhole className="h-3.5 w-3.5" />}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="shrink-0 rounded p-1 text-on-surface-variant/70 transition hover:bg-surface-container-high hover:text-on-surface"
                        aria-label={showPw ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    }
                  >
                    <input
                      name="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent font-mono text-[14px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                    />
                  </Field>

                  {err && (
                    <div className="flex items-start gap-2 rounded-md bg-error-container/15 px-3 py-2 text-[12px] text-secondary">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                      <span className="font-mono leading-relaxed">{err}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary-container px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-on-primary-fixed transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("signing_in")}
                      </>
                    ) : (
                      <>
                        {t("sign_in")}
                        <span className="font-mono text-[10px] tracking-[0.2em] opacity-70">↵</span>
                      </>
                    )}
                  </button>

                   {/* Trust callout below button */}
                  <div className="mt-1 rounded-md border border-white/[0.04] bg-(--color-void) px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-primary-fixed-dim">
                      <ShieldCheck className="h-3 w-3" strokeWidth={2.25} />
                      {t("creds_banner_title")}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-on-surface-variant/70">
                      {t("creds_banner_desc")}{" "}
                      <Link
                        href="https://github.com/Harry-kp/uppcl-pro#security--privacy"
                        target="_blank"
                        className="text-primary-fixed-dim underline-offset-2 hover:underline"
                      >
                        {t("how_it_works")}
                      </Link>
                    </p>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-[980px] px-6 pb-6 font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50">
        <span>{t("footer_line")} &nbsp;·&nbsp; </span>
        <Link
          href="https://github.com/Harry-kp/uppcl-pro"
          target="_blank"
          className="text-on-surface-variant/70 hover:text-on-surface"
        >
          GitHub
        </Link>
      </footer>
    </div>
  );
}

function Pitch({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[12px] leading-relaxed text-on-surface-variant">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-surface-container-low text-primary-fixed-dim">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Field({
  label,
  hint,
  icon,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
          {label}
        </span>
        {hint && <span className="font-mono text-[10px] text-on-surface-variant/60">{hint}</span>}
      </div>
      <div className="group flex items-center gap-2 rounded-md border border-white/[0.06] bg-(--color-void) px-3 py-2.5 transition focus-within:border-primary-fixed-dim/60 focus-within:ring-2 focus-within:ring-primary-fixed-dim/20">
        <span className="text-on-surface-variant/70 group-focus-within:text-primary-fixed-dim">{icon}</span>
        {children}
        {trailing}
      </div>
    </label>
  );
}

function ProxyDownPanel({ message }: { message: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-secondary/10 text-secondary">
        <AlertTriangle className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="font-mono text-[20px] text-secondary">Connection error</div>
      <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">
        Could not reach the UPPCL API. This usually means the upstream
        server is down or your network is blocking the connection.
      </p>
      <p className="mt-4 font-mono text-[11px] text-on-surface-variant/70">{message}</p>
    </div>
  );
}
