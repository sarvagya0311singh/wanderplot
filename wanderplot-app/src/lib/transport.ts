export type Vehicle = 'bike' | 'car' | 'bus' | 'train' | 'flight' | 'flexible';

export const VEHICLES: { value: Vehicle; label: string; emoji: string; roadMode: boolean }[] = [
  { value: 'flexible', label: 'Flexible / Any', emoji: '🧭', roadMode: false },
  { value: 'bike',     label: 'Bike',           emoji: '🏍️', roadMode: true  },
  { value: 'car',      label: 'Car',            emoji: '🚗', roadMode: true  },
  { value: 'bus',      label: 'Bus',            emoji: '🚌', roadMode: true  },
  { value: 'train',    label: 'Train',          emoji: '🚆', roadMode: false },
  { value: 'flight',   label: 'Flight',         emoji: '✈️', roadMode: false },
];

// comfortable km/day, absolute one-way max (short trip). 0 = no distance gate.
const SPEC: Record<Vehicle, { perDay: number; maxKm: number }> = {
  bike:     { perDay: 300, maxKm: 700 },
  car:      { perDay: 400, maxKm: 900 },
  bus:      { perDay: 600, maxKm: 1000 },
  train:    { perDay: 0,   maxKm: 0 },   // connectivity, not radius
  flight:   { perDay: 0,   maxKm: 0 },
  flexible: { perDay: 0,   maxKm: 0 },
};

export const isRoadMode = (v?: Vehicle) => v === 'bike' || v === 'car' || v === 'bus';
export const comfortableKmPerDay = (v: Vehicle) => SPEC[v].perDay;
export const vehicleMaxKm = (v: Vehicle) => SPEC[v].maxKm;

/** Effective max-distance radius (meters) given vehicle, user radius, and trip days. */
export function effectiveMaxDistanceMeters(v: Vehicle, days: number, userKm?: number, tripLenDefaultM?: number): number {
  if (!isRoadMode(v)) return tripLenDefaultM ?? 10_000_000; // train/flight/flexible: no gate (or trip-length default)
  const modeDefaultKm = Math.max(comfortableKmPerDay(v) * Math.max(days, 1), comfortableKmPerDay(v));
  const chosenKm = userKm && userKm > 0 ? userKm : modeDefaultKm;
  const cappedKm = Math.min(chosenKm, vehicleMaxKm(v));       // never exceed the mode's absolute max
  return cappedKm * 1000;
}

export function destFeasibility(dest: { name: string; requiresFlight?: boolean; dealbreakers?: string[]; isIsland?: boolean; highAltitude?: boolean; hasRailhead?: boolean }) {
  const n = dest.name.toLowerCase();
  return {
    isIsland:     dest.isIsland ?? (/andaman|nicobar|lakshadweep/.test(n) || !!dest.requiresFlight || !!dest.dealbreakers?.includes('no-flights')),
    highAltitude: dest.highAltitude ?? /ladakh|spiti|valley of flowers|zanskar|leh|rohtang/.test(n),
    hasRailhead:  dest.hasRailhead ?? true,
  };
}
