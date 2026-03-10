// ─── World Map & Shipping Routes ────────────────────────
// Authoritative source for city positions, colors, and route distances.
// Used by both client (SVG rendering) and server (travel time calculation).

export const citiesData = [
  { id: "AGRARIA",  name: "Agraria",  x: 200, y: 300, color: "#4ade80", type: "Food & Agriculture" },
  { id: "TEXTILIS", name: "Textilis", x: 250, y: 480, color: "#c084fc", type: "Textiles & Fashion" },
  { id: "FERRUM",   name: "Ferrum",   x: 450, y: 150, color: "#94a3b8", type: "Industry & Tools" },
  { id: "VOLTARA",  name: "Voltara",  x: 550, y: 220, color: "#facc15", type: "Energy & Fuel" },
  { id: "MEDICO",   name: "Medico",   x: 700, y: 400, color: "#38bdf8", type: "Science & Alchemy" },
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
