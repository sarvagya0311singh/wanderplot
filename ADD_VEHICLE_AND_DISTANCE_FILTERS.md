# WanderPlot — Feature: Vehicle (transport mode) + Distance filters

> **Execution target:** Antigravity. Self-contained brief to add two new planner inputs — **Vehicle**
> (bike / car / bus / train / flight) and **Max Distance** (km radius) — that (a) constrain & rank
> destinations and (b) tailor the generated itinerary to the chosen mode. Research-backed with concrete
> India km/day norms. Implement end-to-end; the transport mode must be considered everywhere.
>
> **Repo:** `wanderplot-app/` — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Mongoose,
> Gemini. **⚠️ Before coding:** read `wanderplot-app/AGENTS.md` and the relevant
> `node_modules/next/dist/docs/` guide. Keep no-DB / no-key fallbacks intact.

---

## Concept (the model that drives everything)

> **Research finding:** distance is a real gate for **road modes** (bike/car/bus) but a *weak* one for
> **train/flight**, where *connectivity* (railhead/airport) matters more than radius. So: gate road
> modes by distance; gate rail/air by reachability flags.

**Per-mode constants** (India norms — bake these into a single source of truth):

| Vehicle | Comfortable km/day | Absolute one-way max (short trip) | Distance gate? | Itinerary style |
|---------|-------------------:|----------------------------------:|----------------|-----------------|
| `bike`  | 300 (≈200 in hills) | 700 km | **Yes** | ride legs, riding hours, fuel/rest stops, gear, acclimatization |
| `car`   | 400 | 900 km | **Yes** | driving legs, scenic stops, parking/tolls, early starts |
| `bus`   | 600 (overnight) | 1,000 km | **Yes** | intercity/overnight-sleeper legs, boarding/drop points |
| `train` | — (connectivity) | — (very high) | **No** (use railhead flag) | station transfers, class (3A/2A AC), overnight trains, Tatkal note |
| `flight`| — | — (anywhere w/ airport) | **No** | airport transfers + check-in buffer, baggage, in-city only |
| `flexible` (default) | — | — | No (current trip-length band) | generic (today's behaviour) |

**Distance precedence:** `user radius` > `mode default (comfortable/day × days)` > `trip-length default`.
For road modes, hard-gate at `min(userRadius, absoluteMax)`. For train/flight, **bypass the geo gate**
and filter on connectivity + exclusion tags instead.

> Sources: motorcycle 300–400 km/day & packing (reallybigbikeride.com); car ~250–400 km/day
> (everythingcandid.com); overnight bus 400–800 km (zingbus.com); train classes/booking (seat61.com);
> Ladakh/Spiti seasonal road closures Jun–Sep only (wanderon.in); Andaman has no road/rail —
> flight-only (go2andaman.com); mode+radius UX (Roadtrippers, AdventureGenie).

---

## 1. Data: per-mode constants + destination feasibility flags

### 1a. New module `src/lib/transport.ts`
Single source of truth for the constants and helpers:
```ts
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
```

### 1b. Destination feasibility (works on CURRENT data — no migration required)
Add optional flags to the schema for future enrichment, but **derive them from existing data now** so the
feature works immediately:
- `isIsland` — true if name matches `/andaman|nicobar|lakshadweep/i`, OR the catalog entry already has
  `dealbreakers: ['no-flights']` / `requiresFlight === true`. (Andaman is already tagged in
  `src/data/destinations.ts`.)
- `highAltitude` — name matches `/ladakh|spiti|valley of flowers|zanskar|leh|rohtang/i` (reuse the
  existing parents-filter regex pattern in the recommend route).
- `hasRailhead` — default **true** (most mainland towns); only `false` when explicitly flagged.

Add a derivation helper in `src/lib/transport.ts`:
```ts
export function destFeasibility(dest: { name: string; requiresFlight?: boolean; dealbreakers?: string[]; isIsland?: boolean; highAltitude?: boolean; hasRailhead?: boolean }) {
  const n = dest.name.toLowerCase();
  return {
    isIsland:     dest.isIsland ?? (/andaman|nicobar|lakshadweep/.test(n) || !!dest.requiresFlight || !!dest.dealbreakers?.includes('no-flights')),
    highAltitude: dest.highAltitude ?? /ladakh|spiti|valley of flowers|zanskar|leh|rohtang/.test(n),
    hasRailhead:  dest.hasRailhead ?? true,
  };
}
```
(Also add `isIsland?`, `highAltitude?`, `hasRailhead?` to `DestinationDoc` in `recommend.ts` and the
Mongoose `Destination` schema as optional fields, so Gemini enrichment can populate them later.)

---

## 2. Inputs: thread `vehicle` + `maxDistanceKm` through the app

- **`TripInputsState`** (`src/app/plan/page.tsx`, ~line 11): add
  `vehicle?: Vehicle; maxDistanceKm?: number;`
- **`TripInputs`** (`src/lib/recommend.ts`, line 24): add the same two fields.
- **`ItineraryInputs`** (`src/lib/itinerary.ts`): add `vehicle?: Vehicle; maxDistanceKm?: number;`
- The `/api/recommend` and `/api/itinerary/generate` bodies already forward the whole inputs object —
  just read the new fields.

---

## 3. UI — `src/components/PlannerForm.tsx`

Add a **Vehicle** section (single-select segmented control with icons) and a **conditional Distance**
control, placed near "Travel Pace" / before "Hard Constraints":

```tsx
import { VEHICLES, isRoadMode, comfortableKmPerDay, vehicleMaxKm, Vehicle } from '@/lib/transport';
const [vehicle, setVehicle] = useState<Vehicle>('flexible');
const [maxDistanceKm, setMaxDistanceKm] = useState<number | undefined>(undefined);

// Vehicle: single-select pills (reuse the GROUP_TYPES button styling)
<label …><Car className="w-4 h-4 text-brand" /> How will you travel?</label>
<div className="flex flex-wrap gap-2">
  {VEHICLES.map(v => (
    <button key={v.value} type="button" onClick={() => {
      setVehicle(v.value);
      // seed a sensible default radius for road modes
      setMaxDistanceKm(isRoadMode(v.value) ? comfortableKmPerDay(v.value) * days : undefined);
    }} className={/* selected → bg-brand text-white border-brand; else outline */}>
      <span>{v.emoji}</span> {v.label}
    </button>
  ))}
</div>

{/* Distance — ONLY for road modes (bike/car/bus); hidden for train/flight/flexible */}
{isRoadMode(vehicle) && (
  <div className="mt-4">
    <label …>Max distance from origin</label>
    <input type="range" min={50} max={vehicleMaxKm(vehicle)} step={25}
           value={maxDistanceKm ?? comfortableKmPerDay(vehicle) * days}
           onChange={(e) => setMaxDistanceKm(Number(e.target.value))} className="w-full accent-brand" />
    <div className="text-center mt-1 text-sm">
      <span className="font-bold text-brand">{maxDistanceKm ?? comfortableKmPerDay(vehicle) * days} km</span>
      <span className="text-gray-400 ml-1">one-way radius</span>
    </div>
    {/* optional: a numeric input mirroring the slider, clamp-on-blur like budget/days */}
  </div>
)}
```
- Include both `vehicle` and `maxDistanceKm` in the `onSubmit` payloads (`handleSubmit` **and**
  `handleSurpriseMe`).
- For `train`/`flight`/`flexible`, show a one-line hint instead of the slider, e.g. *"We'll match
  rail/air-reachable destinations — distance isn't a limit."*
- (Optional polish per research: visualize the radius as a circle on a small map — not required for v1.)

---

## 4. Recommendation logic — distance gate + feasibility

### 4a. `src/app/api/recommend/route.ts`
- Read `vehicle` (default `'flexible'`) and `maxDistanceKm` into `inputs`.
- Replace the `$geoNear` distance source (currently `maxDistanceMeters(inputs.days)`, line ~111) with:
  ```ts
  import { effectiveMaxDistanceMeters, isRoadMode, destFeasibility } from '@/lib/transport';
  const tripLenDefault = maxDistanceMeters(inputs.days);
  const distanceM = effectiveMaxDistanceMeters(inputs.vehicle ?? 'flexible', inputs.days, inputs.maxDistanceKm, tripLenDefault);
  ```
- Extend `hardQuery` (after the existing dealbreaker filters, ~line 102) with mode feasibility:
  ```ts
  const v = inputs.vehicle ?? 'flexible';
  if (isRoadMode(v)) {            // bike/car/bus can't reach islands / flight-only places
    hardQuery.requiresFlight = false;
    hardQuery.name = { ...(hardQuery.name ?? {}), $not: /andaman|nicobar|lakshadweep/i };
  }
  // train: exclude islands too (no rail to islands); flight: no extra gate
  if (v === 'train') hardQuery.name = { ...(hardQuery.name ?? {}), $not: /andaman|nicobar|lakshadweep/i };
  ```
- **Include `vehicle` + `maxDistanceKm` in the recommendation `buildCacheKey`** (so bike vs flight don't
  share cached results).
- The `$geoNear` already injects `distanceMeters`; the scorer keeps ranking closer places higher.

### 4b. `src/lib/recommend.ts` — feasibility filter + soft demotion
- In `passesHardFilters(dest, inputs)`, add a vehicle gate using `destFeasibility(dest)`:
  - Road mode + `isIsland` → **exclude**.
  - Road mode + `dest.distanceMeters` (or computed km) **> effective max** → exclude (the $geoNear
    already caps this; for the no-DB/static path, compute haversine and apply the same cap).
  - `train` + `isIsland` → exclude. (`hasRailhead === false` → demote with a "nearest railhead" note,
    not exclude.)
- In `scoreDestinations`, add **soft demotions + warnings** (don't hard-exclude — be graceful):
  - Road mode + `highAltitude` + month **not** in Jun–Sep → subtract from score and push warning:
    *"High-altitude roads (e.g. Ladakh/Spiti) are typically open only Jun–Sep; consider flying in or
    travelling in season."*
  - Road mode + distance in the `(comfortable×days, absoluteMax]` band → keep but add warning:
    *"~{km} km is a long haul by {vehicle} — plan it over {n} days or consider train/flight."*
- Add a tiny helper `comfortableSplitDays(km, vehicle)` = `Math.ceil(km / comfortableKmPerDay)` for the
  warning text.

---

## 5. Itinerary tailored to the mode — `src/lib/itinerary.ts`

### 5a. Cache key — MUST include vehicle (different transport ⇒ different plan)
In `buildItineraryCacheKey`, add `vehicle: inputs.vehicle ?? 'flexible'` and
`maxDistanceKm: inputs.maxDistanceKm ?? 0` to the hashed object. (Also bump `ITINERARY_CACHE_VERSION`
so old cached itineraries don't serve the wrong transport style.)

### 5b. Prompt — branch the structure on vehicle
In `buildItineraryPrompt`, after the existing traveller lines, inject a mode block:
```ts
import { Vehicle } from '@/lib/transport';
function transportGuidance(v: Vehicle, days: number): string {
  switch (v) {
    case 'bike': return `TRANSPORT = MOTORCYCLE ROAD TRIP. Structure each travel day as ride legs with
approx km and riding hours (target ~300 km/day on highways, ~200 km/day in hills). Start at dawn, finish
before dusk (no night riding). Call out fuel stops (flag stretches where pumps are 150+ km apart) and
tea/rest breaks. Add a riding-gear & spares packing list (layered gear, gloves, rain cover, spare
tube/levers, offline maps). For hill/high-altitude routes include acclimatization rest day(s) and a
road-condition/weather caveat.`;
    case 'car': return `TRANSPORT = SELF-DRIVE CAR ROAD TRIP. Structure travel days as driving legs with
approx km and time (cap ~400 km/day; assume ~45–55 km/h effective on Indian highways). Add scenic stops,
food halts, parking and toll notes, and recommend early starts.`;
    case 'bus': return `TRANSPORT = INTERCITY BUS. Use intercity legs, prefer one overnight sleeper/Volvo
leg to save a hotel night; note boarding and drop-off points; arrange in-destination local transport. No
self-driving.`;
    case 'train': return `TRANSPORT = TRAIN. Use rail legs with station transfers; recommend class
(3A/2A AC for overnight) and use overnight trains to save a hotel night; mention nearest railhead +
last-mile to the destination and the IRCTC 120-day/Tatkal booking tip. No inter-city driving.`;
    case 'flight': return `TRANSPORT = FLIGHT. Include airport transfers at both ends and a ~2 hr
check-in/security buffer and baggage note; then make the rest of the plan purely local/in-city — NO
inter-city driving days. Maximise time at the destination.`;
    default: return `TRANSPORT = FLEXIBLE. Suggest the most sensible mix of transport for the route.`;
  }
}
// …inject: `\n- ${transportGuidance(inputs.vehicle ?? 'flexible', inputs.days)}\n`
```
Also add a rule: *"The budgetBreakdown 'transport' figure must reflect the chosen mode (fuel/tolls for
bike/car, tickets for bus/train/flight)."*

### 5c. Known-destination flow
Ensure `vehicle`/`maxDistanceKm` flow into the known-destination itinerary too (the `inputs` object
already carries them).

---

## 6. Acceptance criteria
1. **Bike + 300 km from Delhi:** recommendations are all within ~300 km (e.g. Jaipur, Rishikesh,
   Agra) — no Goa/Andaman; the itinerary is a **bike road trip** (ride legs with km/hours, fuel stops,
   gear list).
2. **Car + 600 km:** results expand to ~600 km; itinerary shows **driving legs**, scenic stops,
   parking/tolls.
3. **Bike/Car selecting an island (or Andaman in results):** **excluded**; if a long-haul/high-altitude
   pick appears, it carries the correct **warning** (split over N days / off-season road closure).
4. **Train:** islands excluded; itinerary uses **station transfers + overnight train + class**; no
   distance slider shown.
5. **Flight:** distance is not a limit; itinerary uses **airport transfers + in-city plan only**.
6. **Flexible (default):** behaves exactly like today (no regression).
7. Switching vehicle for the **same** destination/inputs produces a **different itinerary** (cache key
   includes vehicle) — bike vs flight are clearly different plans.
8. No-DB / no-key fallbacks still work; the distance cap applies in the static-catalog path too.

## 7. Files touched & order
1. `src/lib/transport.ts` (new) — constants, `isRoadMode`, `effectiveMaxDistanceMeters`, `destFeasibility`.
2. `src/lib/recommend.ts` — add `vehicle`/`maxDistanceKm` to `TripInputs` + `DestinationDoc` flags;
   feasibility in `passesHardFilters`; soft demotions/warnings in `scoreDestinations`.
3. `src/app/api/recommend/route.ts` — read inputs; `effectiveMaxDistanceMeters`; mode `hardQuery`;
   add vehicle/distance to `buildCacheKey`.
4. `src/lib/itinerary.ts` — `ItineraryInputs` fields; vehicle in cache key (+ bump version);
   `transportGuidance` in the prompt; transport-cost rule.
5. `src/app/plan/page.tsx` — `TripInputsState` fields.
6. `src/components/PlannerForm.tsx` — Vehicle segmented control + conditional Distance control; include
   in both submit payloads.
7. `src/models/Destination.ts` — optional `isIsland`/`highAltitude`/`hasRailhead` (future enrichment).
8. `npm run build` + `npm run lint`; verify every Acceptance item.

## 8. Out of scope / keep intact
- No external maps/routing API — distances use the existing geocoded origin + haversine/$geoNear.
- Don't break the "Help me decide", "Surprise Me", or known-destination flows; `flexible` preserves
  today's behaviour.
- Keep scoring weights and caching/single-flight; only add the vehicle/distance terms + cache-key fields.

## 9. Research sources
Motorcycle 300–400 km/day & packing (reallybigbikeride.com); car ~250–400 km/day (everythingcandid.com);
weekend road-trip ≤300 km (revv.co.in); overnight bus 400–800 km (zingbus.com); train classes/booking
(seat61.com, thetraveler.org); Ladakh/Spiti seasonal closures Jun–Sep (wanderon.in, rocknrollriders.com);
Andaman no road/rail — flight only (go2andaman.com); flight baggage/check-in (goindigo.in); mode+radius
UX (Roadtrippers, AdventureGenie, TripGo).
