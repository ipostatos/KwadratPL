"use client";

// Порт webapp/index.html на Next.js (static export). Тот же словарь, иконки и
// токены; те же ключи localStorage (kw_saved / kw_favs) и тот же снапшот
// data/listings.json. Ссылки на ещё не портированные экраны ведут на будущие
// Next-маршруты (/search, /saved …) — они наполнятся по мере переноса.

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { useI18n, CITY_KEYS } from "@/lib/i18n";
import { loadListings, readArray, type Listing, type Inventory } from "@/lib/data";
import styles from "./home.module.css";

const CITY_TONES = ["blue", "green", "amber", "violet", "cyan", "gold"];

interface Sub {
  notify?: boolean;
  [k: string]: unknown;
}

export default function Home() {
  const { t, lang, langs, setLang, cityName } = useI18n();
  const [inv, setInv] = useState<Inventory>({ listings: [], live: true });
  const [saved, setSaved] = useState<Sub[]>([]);
  const [favs, setFavs] = useState<unknown[]>([]);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    loadListings().then(setInv);
    setSaved(readArray<Sub>("kw_saved"));
    setFavs(readArray("kw_favs"));
  }, []);

  const cityCount = (key: string) =>
    inv.listings.filter((l: Listing) => l.city === key).length;
  const activeSubs = saved.filter((s) => s && s.notify);

  return (
    <>
      <div className={styles.hero}>
        <Icon name="building" className={`${styles.logo} emi`} />
        <h1>Kwadrat PL</h1>
        <button className="lang-chip" onClick={() => setLangOpen((o) => !o)}>
          {lang.toUpperCase()} · {t("langBtn")}
        </button>
      </div>

      {langOpen && (
        <div className={styles.langMenu}>
          {langs.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                setLangOpen(false);
              }}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      )}

      <p className="sub">{t("homeSub")}</p>

      {/* ПРИОРИТЕТ: что делать прямо сейчас */}
      <div className={styles.next}>
        <div className={styles.label}>
          {activeSubs.length ? t("subsActive") : t("nextLabel")}
        </div>
        <div className={styles.big}>
          {activeSubs.length ? t("trackedN", { n: activeSubs.length }) : t("nextTitle")}
        </div>
        <div className={styles.hintline}>{t("nextHint")}</div>
        <div className={styles.actions}>
          <Link className="btn" href="/search">
            <Icon name="search" className="emi" /> {t("btnSearch")}
          </Link>
          <Link className="btn ghost" href="/saved">
            <Icon name="bell" className="emi" /> {t("btnSubs")}
          </Link>
        </div>
      </div>

      {/* мини-статистика */}
      <div className={styles.mini}>
        <div>
          <div className={styles.k}>{t("statListings")}</div>
          <div className={styles.v}>{inv.listings.length}</div>
        </div>
        <div>
          <div className={styles.k}>{t("statSubs")}</div>
          <div className={styles.v}>{saved.length}</div>
        </div>
        <div>
          <div className={styles.k}>{t("statFavs")}</div>
          <div className={styles.v}>{favs.length}</div>
        </div>
      </div>

      {/* РАЗДЕЛЫ ПОИСКА */}
      <div className={styles.sectionTitle}>{t("secSearch")}</div>
      <div className={styles.grid}>
        <Link className={styles.cell} href="/search?type=long">
          <Icon name="home" className="ic-tile blue" />
          <div className={styles.t}>{t("long")}</div>
          <div className={styles.d}>{t("cellLongD")}</div>
        </Link>
        <Link className={styles.cell} href="/search?type=short">
          <Icon name="key" className="ic-tile amber" />
          <div className={styles.t}>{t("short")}</div>
          <div className={styles.d}>{t("cellShortD")}</div>
        </Link>
        <Link className={`${styles.cell} ${styles.wide}`} href="/search?type=room">
          <Icon name="bed" className="ic-tile violet" />
          <div className={styles.body}>
            <div className={styles.t}>{t("cellRoomT")}</div>
            <div className={styles.d}>{t("cellRoomD")}</div>
          </div>
          <div className={styles.chev}>›</div>
        </Link>
        <Link className={`${styles.cell} ${styles.wide}`} href="/search?pets=1">
          <Icon name="paw-print" className="ic-tile green" />
          <div className={styles.body}>
            <div className={styles.t}>{t("cellPetsT")}</div>
            <div className={styles.d}>{t("cellPetsD")}</div>
          </div>
          <div className={styles.chev}>›</div>
        </Link>
        <Link className={styles.cell} href="/saved">
          <Icon name="bell" className="ic-tile green" />
          <div className={styles.t}>{t("cellSubsT")}</div>
          <div className={styles.d}>{t("cellSubsD")}</div>
        </Link>
        <Link className={styles.cell} href="/saved#fav">
          <Icon name="heart" className="ic-tile red" />
          <div className={styles.t}>{t("cellFavT")}</div>
          <div className={styles.d}>{t("cellFavD")}</div>
        </Link>
      </div>

      {/* ПОЛЕЗНОЕ */}
      <div className={styles.sectionTitle}>{t("secUseful")}</div>
      <div className={styles.grid}>
        <Link className={`${styles.cell} ${styles.wide}`} href="/kaucja">
          <Icon name="wallet" className="ic-tile gold" />
          <div className={styles.body}>
            <div className={styles.t}>{t("cellKaucjaT")}</div>
            <div className={styles.d}>{t("cellKaucjaD")}</div>
          </div>
          <div className={styles.chev}>›</div>
        </Link>
        <Link className={styles.cell} href="/umowa">
          <Icon name="file-text" className="ic-tile cyan" />
          <div className={styles.t}>{t("cellUmowaT")}</div>
          <div className={styles.d}>{t("cellUmowaD")}</div>
        </Link>
        <Link className={styles.cell} href="/checklist">
          <Icon name="check-square" className="ic-tile green" />
          <div className={styles.t}>{t("cellCheckT")}</div>
          <div className={styles.d}>{t("cellCheckD")}</div>
        </Link>
        <Link className={styles.cell} href="/phrases">
          <Icon name="message-circle" className="ic-tile blue" />
          <div className={styles.t}>{t("cellPhrasesT")}</div>
          <div className={styles.d}>{t("cellPhrasesD")}</div>
        </Link>
        <Link className={styles.cell} href="/koszty">
          <Icon name="calculator" className="ic-tile violet" />
          <div className={styles.t}>{t("cellKosztyT")}</div>
          <div className={styles.d}>{t("cellKosztyD")}</div>
        </Link>
      </div>

      {/* ГОРОДА */}
      <div className={styles.sectionTitle}>{t("secCities")}</div>
      <div className={styles.grid}>
        {CITY_KEYS.map((key, i) => (
          <Link
            key={key}
            className={`${styles.cell} ${styles.cityCell}`}
            href={`/search?city=${key}`}
          >
            <Icon name="map-pin" className={`ic-tile ${CITY_TONES[i % CITY_TONES.length]}`} />
            <div className={styles.t}>{cityName(key)}</div>
            <div className={styles.cnt}>{cityCount(key)}</div>
          </Link>
        ))}
      </div>

      <Link
        className={`${styles.cell} ${styles.wide}`}
        href="/about"
        style={{ marginTop: 12 }}
      >
        <Icon name="info" className="ic-tile" />
        <div className={styles.body}>
          <div className={styles.t}>{t("aboutT")}</div>
          <div className={styles.d}>{t("aboutD")}</div>
        </div>
        <div className={styles.chev}>›</div>
      </Link>

      <p className="foot">{inv.live ? t("footHome") : t("footHomeDemo")}</p>
    </>
  );
}
