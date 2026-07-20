// ===========================================================================
// Генератор фирменного стиля карты «Polish Urban Minimal» для карты объявлений
// (webapp/mapa.html): берём positron от OpenFreeMap (та же схема OpenMapTiles,
// тайлы/глифы остаются на их хосте — сервис бесплатный, без ключей и лимитов)
// и перекрашиваем слои в нашу палитру. Светлая + тёмная темы из одной базы.
// Запуск: node tools/build-mapstyle.mjs  → webapp/map/style-{light,dark}.json
// Генерённые файлы коммитятся — в рантайме и CI ничего не собирается.
// ===========================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "webapp", "map");
const BASE = "https://tiles.openfreemap.org/styles/positron";

// палитра Polish Urban Minimal (light) и её ночная производная (dark)
const P = {
  light: {
    bg: "#F4F3EF", water: "#B9D8F2", park: "#DCEBD8", wood: "#CFE3CA",
    residential: "#EFEEE9", building: "#E7E5DF",
    roadMinor: "#FFFFFF", roadCasing: "#DDDCD7", roadMajor: "#FFF4D8",
    rail: "#DDDCD7", boundary: "#C9C7C1",
    text: "#363636", text2: "#7A7A7A", halo: "#F4F3EF",
  },
  dark: {
    bg: "#191A1C", water: "#17303F", park: "#1E2A1F", wood: "#1B251C",
    residential: "#1D1E20", building: "#242528",
    roadMinor: "#2A2B2E", roadCasing: "#323336", roadMajor: "#3A3428",
    rail: "#323336", boundary: "#3C3D40",
    text: "#E6E6E4", text2: "#96979A", halo: "#191A1C",
  },
};

// слой → какие paint-свойства перекрасить (значения — ключи палитры)
const FILL = {
  background: ["background-color", "bg"],
  park: ["fill-color", "park"],
  water: ["fill-color", "water"],
  landcover_wood: ["fill-color", "wood"],
  landuse_residential: ["fill-color", "residential"],
  building: ["fill-color", "building"],
  "aeroway-area": ["fill-color", "residential"],
  road_area_pier: ["fill-color", "residential"],
};
const LINE = {
  waterway: "water",
  highway_path: "roadCasing",
  highway_minor: "roadMinor",
  highway_major_casing: "roadCasing",
  highway_major_inner: "roadMajor",
  highway_major_subtle: "roadCasing",
  highway_motorway_casing: "roadCasing",
  highway_motorway_inner: "roadMajor",
  highway_motorway_subtle: "roadCasing",
  highway_motorway_bridge_casing: "roadCasing",
  highway_motorway_bridge_inner: "roadMajor",
  tunnel_motorway_casing: "roadCasing",
  tunnel_motorway_inner: "roadMajor",
  "aeroway-taxiway": "roadMinor",
  "aeroway-runway-casing": "roadCasing",
  "aeroway-runway": "roadMinor",
  road_pier: "roadMinor",
  railway: "rail",
  railway_dashline: "rail",
  railway_service: "rail",
  railway_service_dashline: "rail",
  railway_transit: "rail",
  railway_transit_dashline: "rail",
  boundary_2: "boundary",
  boundary_3: "boundary",
  boundary_disputed: "boundary",
};
// крупные подписи (город/район) — основной текст, остальное — вторичный
const TEXT_MAIN = /^place_label|^place_/;

function restyle(style, pal) {
  const s = structuredClone(style);
  for (const l of s.layers) {
    l.paint = l.paint || {};
    if (FILL[l.id]) {
      const [prop, key] = FILL[l.id];
      l.paint[prop] = pal[key];
      delete l.paint["fill-outline-color"];
    } else if (LINE[l.id] && l.type === "line") {
      l.paint["line-color"] = pal[LINE[l.id]];
    } else if (l.type === "symbol") {
      l.paint["text-color"] = TEXT_MAIN.test(l.id) ? pal.text : pal.text2;
      l.paint["text-halo-color"] = pal.halo;
      l.paint["text-halo-width"] = 1.2;
    } else if (l.type === "fill") {
      l.paint["fill-color"] = pal.residential;   // прочие заливки — нейтрально
      delete l.paint["fill-outline-color"];
    } else if (l.type === "line") {
      l.paint["line-color"] = pal.roadCasing;
    }
  }
  return s;
}

const base = await (await fetch(BASE)).json();
mkdirSync(OUT, { recursive: true });
for (const theme of ["light", "dark"]) {
  const out = restyle(base, P[theme]);
  out.name = `KwadratPL Urban Minimal (${theme})`;
  writeFileSync(join(OUT, `style-${theme}.json`), JSON.stringify(out));
  console.log(`style-${theme}.json: ${out.layers.length} layers`);
}
