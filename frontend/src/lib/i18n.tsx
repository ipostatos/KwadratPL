"use client";

// I18N для frontend/ поверх ТОГО ЖЕ словаря, что и webapp (../webapp/i18n.dict.js).
// Язык хранится в том же ключе localStorage "kw_lang", поэтому выбор языка общий
// между двумя фронтендами. SSR/экспорт пре-рендерит с "ru", после гидрации
// подхватывает сохранённый/определённый язык — как делает vanilla-версия.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import KW, { type Lang, type Row } from "@shared/i18n.dict.js";

const DICT: Record<string, Row> = KW.DICT;
const LANGS: Lang[] = KW.LANGS;
const CITY_NAMES: Record<string, Row> = KW.CITY_NAMES;

function detectDefault(): string {
  try {
    const w = window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
    };
    const tg = w.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    let c = (tg || navigator.language || "en").slice(0, 2).toLowerCase();
    if (c === "uk") c = "ua";
    return DICT.long[c] ? c : "en";
  } catch {
    return "en";
  }
}

type Vars = Record<string, string | number>;

interface I18nValue {
  lang: string;
  ready: boolean;
  setLang: (l: string) => void;
  t: (key: string, vars?: Vars) => string;
  cityName: (key: string) => string;
  langs: Lang[];
}

const I18nCtx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState("ru");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("kw_lang") || detectDefault();
    setLangState(saved);
    setReady(true);
  }, []);

  const setLang = useCallback((l: string) => {
    localStorage.setItem("kw_lang", l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const row = DICT[key];
      let s = row ? row[lang] || row.ru : key;
      if (vars) {
        for (const k in vars) s = s.split("{" + k + "}").join(String(vars[k]));
      }
      return s;
    },
    [lang]
  );

  const cityName = useCallback(
    (key: string) => (CITY_NAMES[key] && (CITY_NAMES[key][lang] || CITY_NAMES[key].ru)) || key,
    [lang]
  );

  return (
    <I18nCtx.Provider value={{ lang, ready, setLang, t, cityName, langs: LANGS }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n(): I18nValue {
  const v = useContext(I18nCtx);
  if (!v) throw new Error("useI18n must be used within I18nProvider");
  return v;
}

export const CITY_KEYS = Object.keys(CITY_NAMES);
