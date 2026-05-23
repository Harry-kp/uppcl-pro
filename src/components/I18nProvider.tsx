"use client";

import { NextIntlClientProvider } from "next-intl";
import { useState, createContext, useContext, useCallback, type ReactNode } from "react";

type Locale = "en" | "hi";

const STORAGE_KEY = "uppcl_lang";

const LocaleCtx = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
}>({ locale: "en", setLocale: () => {} });

export function useLocale() {
  return useContext(LocaleCtx);
}

// Pre-import both message bundles so switching is instant
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
const msgs: Record<Locale, typeof en> = { en, hi };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "hi" ? "hi" : "en";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  return (
    <LocaleCtx.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={msgs[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleCtx.Provider>
  );
}
