# WanderPlot — Fix Pack: Known-Destination Itinerary (blank screen), Navbar, Budget/Days Inputs

> **Execution target:** Antigravity. ONE self-contained brief for 4 issues. Issues **3 & 4 are the
> critical ones** (the "I have a destination" → blank itinerary bug) and have a precise root cause.
> Implement everything; verify each Acceptance block.
>
> **Repo:** `wanderplot-app/` — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
> **⚠️ Before coding:** read `wanderplot-app/AGENTS.md` and the relevant `node_modules/next/dist/docs/`
> guide. Keep no-DB / no-key fallbacks intact.

---

## Summary

| # | Issue | Root cause | File(s) |
|---|-------|-----------|---------|
| 1 | Remove "Destinations" + "How it works" navbar links | Not wanted | `src/components/Navbar.tsx` |
| 2 | Budget/Days number inputs can't go below the min while typing | Clamping happens on every `onChange` (min 3000 / 1) → can't type freely | `src/components/PlannerForm.tsx` |
| 3 | "I have a destination" → **no feedback, blank screen, must press repeatedly, toast flashes** | `handleFormSubmit` calls `handleSelectDestination` **without `await`**, then its `finally` sets `loading=false` → the loading overlay is killed during the ~10s generation; and the itinerary step can render **blank** when `itinerary` is null & not `llmError` | `src/app/plan/page.tsx` |
| 4 | Itinerary won't generate for Delhi→**Sultanpur** | The `knownDestination` branch returns a **broken mock** with **no `coordinates`**, `state:'India'`, and a `score` field (code expects `totalScore`) — so the destination is unusable downstream | `src/app/api/recommend/route.ts` (+ `src/lib/recommend.ts`) |

---

## Issue 1 — Remove the "Destinations" / "How it works" navbar links

**Where:** `src/components/Navbar.tsx` — the desktop center cluster renders `Destinations` and
`How it works` pill links (added in a previous pass), and the mobile menu mirrors them.

**Fix:** delete both links from the **desktop** center cluster and the **mobile** menu. Keep:
- Logo (left), the `My Trips` link **only when `session`** (signed in), and the right cluster
  (`Sign In` ghost + the single `Start Planning` primary CTA).
- If removing the center links leaves an empty middle, that's fine — logo-left + CTA-right is a clean
  layout. (You may also delete the now-unused `id="destinations"`/`id="how-it-works"` anchors on the
  homepage `src/app/page.tsx`, but leaving them is harmless.)

**Acceptance:** the navbar no longer shows "Destinations" or "How it works" (desktop and mobile); the
single "Start Planning" CTA + "Sign In" remain; "My Trips" still appears when signed in.

---

## Issue 2 — Budget & Days inputs: allow free typing, clamp only on blur

**Where:** `src/components/PlannerForm.tsx` — the Budget and Days number inputs currently clamp inside
`onChange` (e.g. `setBudget(Math.min(200000, Math.max(3000, …)))`). That forces the value to ≥ min on
every keystroke, so the user can't clear the field or type a value that briefly passes through a
sub-minimum state (e.g. typing "2" → instantly becomes 3000).

> **Desired behaviour (from the user):** while editing, the field behaves like a normal text box —
> the user can clear it or type anything. **On blur** (pointer leaves the field), if the value is
> empty or below the minimum, snap it to the minimum (₹3,000 / 1 day). Above the max → snap to max.

**Fix:** use a local string state for each input, commit valid numbers to the real state on change
(without clamping up), and clamp on blur. Example for Budget (mirror for Days, min 1 / max 14):

```tsx
const [budgetText, setBudgetText] = useState(String(budget)); // keep in sync if slider moves
// keep budgetText in sync when the slider changes:
useEffect(() => { setBudgetText(String(budget)); }, [budget]);

<input
  type="text" inputMode="numeric"
  value={budgetText}
  onChange={(e) => {
    const raw = e.target.value.replace(/[^\d]/g, ''); // digits only; allow empty
    setBudgetText(raw);
    if (raw !== '') setBudget(Number(raw)); // update live value, but DON'T clamp up here
  }}
  onBlur={() => {
    let v = Number(budgetText);
    if (!budgetText || isNaN(v) || v < 3000) v = 3000;  // snap up on blur
    if (v > 200000) v = 200000;                          // snap down on blur
    setBudget(v);
    setBudgetText(String(v));
  }}
  className="w-32 border-2 border-gray-200 rounded-xl pl-7 pr-2 py-2 text-sm font-semibold
             text-center focus:outline-none focus:border-brand"
/>
```
Notes:
- Use `type="text"` + `inputMode="numeric"` (not `type="number"`) so empty/intermediate states are
  allowed and the browser doesn't fight the value.
- The slider keeps writing to `budget`; the `useEffect` keeps the text box in sync when the slider moves.
- Days: identical pattern, clamp to `[1, 14]` on blur, default 1.

**Acceptance:** the user can clear the budget/days field and type freely (including values below the
minimum) without it jumping; when focus leaves the field, an empty or below-minimum value snaps to the
minimum (₹3,000 / 1 day) and above-max snaps to the max; slider and input stay in sync.

---

## Issues 3 & 4 — "I have a destination" → blank screen / won't generate (THE big one)

### Root cause (verified in current code)

**Bug A — the recommend route returns a broken mock** (`src/app/api/recommend/route.ts`, lines
167–181):
```ts
if (body.knownDestination) {
  const mockDest = {
    destination: { name: body.knownDestination, state: 'India' }, // ❌ no coordinates
    score: 100,                                                    // ❌ code reads .totalScore
    reasons: ['You specifically requested this destination.'],
  };
  return NextResponse.json({ results: [mockDest], source: 'direct' });
}
```
This destination has **no `coordinates`**, the wrong `state`, and uses `score` (the UI reads
`totalScore`). The map is hidden (it's guarded by `destination.coordinates`), `matchScore` renders as
`undefined`, and **saving breaks** (`selectedDest.totalScore` / `.destination.coordinates` are
undefined). It also never validates that the place is real.

**Bug B — the loading overlay is killed mid-generation** (`src/app/plan/page.tsx`,
`handleFormSubmit`, lines ~88–90 + the `finally`):
```ts
if (data.knownDestination && json.results.length === 1) {
  handleSelectDestination(json.results[0], data);   // ❌ NOT awaited
}
// …
} finally {
  stopCyclingMessages();
  setLoading(false);   // ❌ runs immediately, hiding the overlay while generation is still in flight
}
```
Because `handleSelectDestination` isn't awaited, `handleFormSubmit`'s `finally` runs `setLoading(false)`
right after it starts — so during the ~10s itinerary generation the user sees the **plain intake form
with no spinner** ("nothing happens; I have to press again"). When generation errors, only a transient
toast flashes.

**Bug C — the itinerary step can render blank.** In the render, `step === 'itinerary'` shows the
error card only if `llmError`, and `ItineraryView` only if `itinerary && !llmError`. If `step` is
`'itinerary'` but `itinerary` is null and `llmError` is false (e.g. an empty/failed generation, or a
retry in-flight), **nothing renders** → blank page (matches the screenshot).

### The fix

#### Part 1 — Properly resolve the known destination (recommend route)

Replace the mock (lines 167–181) with real, **local-first** resolution so the destination always has
coordinates and a proper `ScoredDestination` shape — fast and 100% reliable, no extra Gemini call:

```ts
import { indianCities } from '@/data/indianCities';
import { scoreDestinations } from '@/lib/recommend';
import { regionFromState, geocodeOrigin, validateCoordinates } from '@/lib/geo';
import { destinations as staticCatalog } from '@/data/destinations';

if (body.knownDestination) {
  const partySize = Number(body.partySize) || defaultPartySize(body.groupType ?? 'solo');
  const inputs: TripInputs = {
    origin: body.origin ?? '', budget: Number(body.budget), month: Number(body.month),
    days: Number(body.days), groupType: body.groupType ?? 'solo', pace: body.pace ?? 'moderate',
    scenery: [], experience: [], dealbreakers: body.dealbreakers ?? [], partySize,
    originCoords: body.originCoords || undefined,
  };
  const name = String(body.knownDestination).trim();

  // 1) catalog match (full rich doc) → 2) indianCities (coords+state) → 3) geocode → 4) fallback
  let destDoc: any = null;
  const cat = staticCatalog.find(d => d.name.toLowerCase() === name.toLowerCase());
  if (cat) {
    destDoc = adaptStaticEntry(cat);
  } else {
    const city = indianCities.find(c => c.name.toLowerCase() === name.toLowerCase());
    let coords = city ? { lat: city.lat, lng: city.lng } : null;
    let state = city?.state ?? 'India';
    if (!coords) {
      const geo = await geocodeOrigin(name);           // Nominatim → Gemini, cached, fail-open
      if (geo && validateCoordinates(geo.lat, geo.lng).valid) { coords = { lat: geo.lat, lng: geo.lng }; }
    }
    destDoc = {
      _id: name.toLowerCase().replace(/\s+/g, '-'),
      name, state, country: 'India',
      coordinates: coords ?? undefined,
      location: coords ? { type: 'Point', coordinates: [coords.lng, coords.lat] } : undefined,
      scenery: [], experienceTypes: [],
      bestMonths: [1,2,3,4,5,6,7,8,9,10,11,12],         // unknown → treat as in-season (no false "off")
      budgetRange: { min: 1000, max: 6000 },             // generic; itinerary gen does the real costing
      description: `Your chosen destination: ${name}.`,
      highlights: [], tags: [], images: [], dealbreakers: [],
      confidence: 'high', source: 'ai', popularity: 0,
      region: regionFromState(state),
    };
  }

  // Score the single destination through the EXISTING scorer → proper {totalScore, scores, reasons, seasonStatus}
  const [scored] = scoreDestinations([destDoc], inputs);
  scored.reasons = ['You specifically requested this destination.', ...scored.reasons];
  return NextResponse.json({ results: [scored], source: 'known' });
}
```
- Returns a real `ScoredDestination` (has `totalScore`, `scores`, `reasons`, `seasonStatus`, and a
  `destination` with `coordinates`) — so the map renders, `matchScore` shows a number, and **saving
  works**.
- **Sultanpur** resolves via `indianCities` (Uttar Pradesh + coords) — or geocoding if not present — so
  it's a real, plottable place.
- No Gemini call needed for resolution → fast and reliable. (The rich day-by-day plan still comes from
  the itinerary generation step.)

#### Part 2 — Fix the loading race + never render blank (plan page)

In `src/app/plan/page.tsx`:
1. **Await** the hand-off so the overlay stays up through generation:
   ```ts
   if (data.knownDestination && json.results.length === 1) {
     await handleSelectDestination(json.results[0], data);  // ✅ await
     return;                                                 // skip the recommendations branch + shared finally race
   }
   ```
   (Keeping `loading` true across both calls; since we `await` and `return`, the outer `finally` runs
   only after generation completes. Alternatively, set `loading` once in `handleFormSubmit` and don't
   toggle it inside `handleSelectDestination` when called from here.)
2. **Guard the itinerary step** so it can never be blank — add a loading/empty state when
   `step==='itinerary'` and there's no itinerary and no error:
   ```tsx
   {step === 'itinerary' && !itinerary && !llmError && (
     <div className="max-w-lg mx-auto card p-8 text-center">
       {loading ? (
         <>
           <div className="w-12 h-12 rounded-full border-4 border-brand border-t-transparent animate-spin mx-auto mb-4" />
           <p className="text-brand font-semibold">Building your itinerary…</p>
         </>
       ) : (
         <>
           <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
           <p className="text-zinc-300 mb-4">We couldn’t build this itinerary. Please try again.</p>
           <button onClick={() => selectedDest && handleSelectDestination(selectedDest, inputs ?? undefined)}
                   className="btn-primary">↻ Try again</button>
         </>
       )}
     </div>
   )}
   ```
3. **Treat an empty generation as an error** (don't advance to a blank itinerary). In
   `handleSelectDestination`, after parsing the success response:
   ```ts
   if (!json.itinerary || !Array.isArray(json.itinerary.days) || json.itinerary.days.length === 0) {
     setLlmErrorMsg('The itinerary came back empty. Please try again.');
     setLlmErrorKind('empty'); setLlmError(true); setStep('itinerary'); return;
   }
   setItinerary(json.itinerary); setStep('itinerary');
   ```

#### Part 3 — (already mostly fine) itinerary generate route
No change required for resolution, but confirm the generate route tolerates a destination whose
`coordinates` may be absent (the prompt builder must not throw — it already uses optional fields). The
retry-on-503 / typed errors added previously stay.

### Acceptance — the exact repro
Origin **Delhi**, "I have a destination" = **Sultanpur**, budget **₹25,000**, **4 days**, **April**,
**Solo**, **Packed**:
1. Pressing **Build Itinerary** immediately shows the **loading overlay** ("Building your itinerary…")
   and keeps it until the plan is ready — no dead intake screen, no need to press twice.
2. A **complete itinerary for Sultanpur** renders (with a working map, since coordinates resolve from
   the city list / geocoding), the match score shows a number, and **Save** works.
3. If generation genuinely fails (e.g. transient overload), the user sees the **error card with a
   Try-again button** — **never a blank screen**.
4. The behaviour is reliable across repeated runs and other city names (e.g. "Rishikesh", "Goa",
   "Indore").

---

## Files touched & order
1. `src/app/api/recommend/route.ts` — replace the `knownDestination` mock with real resolution (Part 1).
2. `src/app/plan/page.tsx` — `await` the hand-off, add the itinerary-step guard, treat empty as error (Part 2).
3. `src/components/PlannerForm.tsx` — Budget/Days free-typing + clamp-on-blur (Issue 2).
4. `src/components/Navbar.tsx` — remove the two nav links (Issue 1).
5. `npm run build` + `npm run lint`; verify every Acceptance block.

## Out of scope / keep intact
- No change to itinerary caching/single-flight, scoring weights, or the no-DB/no-key fallbacks.
- Don't reintroduce the duplicate "Plan a Trip" CTA.
- Keep the brand palette, fonts, and the working recommend flow for the "Help me decide" path.
