// ─── World Map & Shipping Routes ────────────────────────
// Authoritative source for city positions, colors, and route distances.
// Used by both client (SVG rendering) and server (travel time calculation).
//
// Map canvas: 1400 × 700 (SVG units)

export const citiesData = [
  {
    id: "AGRARIA",  name: "Agraria",  x: 200, y: 300, color: "#4ade80",
    type: "Food & Agriculture",
    // western farmland territory
    territory: "M70,170 L295,145 L340,255 L318,395 L210,445 L88,425 L55,295 Z",
  },
  {
    id: "TEXTILIS", name: "Textilis", x: 360, y: 540, color: "#c084fc",
    type: "Textiles & Fashion",
    // southern coastal territory
    territory: "M220,450 L475,428 L528,505 L508,622 L368,660 L228,628 L195,545 Z",
  },
  {
    id: "FERRUM",   name: "Ferrum",   x: 640, y: 150, color: "#94a3b8",
    type: "Industry & Tools",
    // northern highlands territory
    territory: "M508,40 L752,18 L818,92 L798,208 L668,248 L512,228 L482,128 Z",
  },
  {
    id: "VOLTARA",  name: "Voltara",  x: 920, y: 290, color: "#facc15",
    type: "Energy & Fuel",
    // central-east plains territory
    territory: "M812,170 L1032,148 L1110,245 L1088,385 L958,428 L810,402 L768,285 Z",
  },
  {
    id: "MEDICO",   name: "Medico",   x: 1160, y: 490, color: "#38bdf8",
    type: "Science & Alchemy",
    // far-east archipelago territory
    territory: "M1050,355 L1265,325 L1342,412 L1320,572 L1185,612 L1050,586 L1005,472 Z",
  },
] as const;

/** Scattered neutral islands for ocean realism */
export const neutralIslands = [
  // Mid-ocean between AGRARIA and FERRUM
  "570,135 608,120 622,148 604,168 568,162",
  // Southern sea passage
  "540,588 578,572 594,595 575,618 538,610",
  // Northern cape near FERRUM
  "778,42 818,28 832,58 810,76 775,68",
  // Far-east waters
  "1238,340 1272,326 1286,352 1262,372 1232,364",
  // Southeastern reef
  "1115,582 1155,568 1168,595 1145,614 1112,606",
] as const;

export const shippingRoutes = [
  { source: "FERRUM",   target: "VOLTARA",  distance: 80  },
  { source: "AGRARIA",  target: "TEXTILIS", distance: 90  },
  { source: "AGRARIA",  target: "FERRUM",   distance: 120 },
  { source: "VOLTARA",  target: "MEDICO",   distance: 150 },
  { source: "AGRARIA",  target: "VOLTARA",  distance: 180 },
  { source: "TEXTILIS", target: "MEDICO",   distance: 180 },
  { source: "FERRUM",   target: "TEXTILIS", distance: 200 },
  { source: "AGRARIA",  target: "MEDICO",   distance: 250 },
  { source: "VOLTARA",  target: "TEXTILIS", distance: 260 },
  { source: "FERRUM",   target: "MEDICO",   distance: 300 },
] as const;

/** Bidirectional lookup: distance in nautical miles (= seconds of travel). */
const routeMap: Record<string, Record<string, number>> = {};
for (const r of shippingRoutes) {
  if (!routeMap[r.source]) routeMap[r.source] = {};
  if (!routeMap[r.target]) routeMap[r.target] = {};
  routeMap[r.source][r.target] = r.distance;
  routeMap[r.target][r.source] = r.distance;
}

/** 1 nautical mile = 1 second travel time */
export function getTravelTimeSeconds(from: string, to: string): number {
  return routeMap[from]?.[to] ?? 0;
}

export const CITY_KEYS = citiesData.map((c) => c.id);
