"use client";

// Тот же источник данных, что и у webapp: снапшот data/listings.json, который
// пишет фетчер. Нет файла (file://, зеркало без данных) — тихо отдаём пусто.
export interface Listing {
  id?: string | number;
  city?: string;
  type?: string;
  price?: number;
  oldPrice?: number;
  area?: number;
  rooms?: number;
  district?: string;
  [k: string]: unknown;
}

export interface Inventory {
  listings: Listing[];
  live: boolean;
}

export async function loadListings(): Promise<Inventory> {
  try {
    const r = await fetch("data/listings.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("no listings");
    const j = await r.json();
    const listings: Listing[] = Array.isArray(j) ? j : j.listings || [];
    return { listings, live: true };
  } catch {
    return { listings: [], live: false };
  }
}

// Те же ключи localStorage, что и у webapp: kw_saved / kw_favs.
export function readArray<T = unknown>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
