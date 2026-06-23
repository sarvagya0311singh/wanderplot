# WanderPlot — Fix Pack: Random Sample, All-India Cities, Planner Inputs, Defaults & Surprise-Me

> **Execution target:** Antigravity. ONE self-contained brief covering 5 changes — implement them all
> in a single pass. Each has the current-code reference, the fix (with snippets), and acceptance.
> Research-backed where it matters (cities dataset). **Repo:** `wanderplot-app/` — Next.js 16 (App
> Router), React 19, TypeScript, Tailwind v4, `downshift`.
>
> **⚠️ Before coding:** read `wanderplot-app/AGENTS.md` ("This is NOT the Next.js you know") and the
> relevant guide in `node_modules/next/dist/docs/`. Don't regress working flows. Keep the no-DB / no-key
> fallbacks intact.

---

## Summary

| # | Change | Files |
|---|--------|-------|
| 1 | **"View sample trip"** picks a **random** itinerary each click (not always Ladakh) | `src/app/page.tsx` |
| 2 | **All-India cities** in the dropdown (~6,500 towns, not ~50) | `src/data/indianCities.ts` (regenerate) + `scripts/` + `CityCombobox.tsx` (lazy-load) |
| 3 | **Editable number inputs** for Budget & Days (alongside the sliders) | `src/components/PlannerForm.tsx` |
| 4 | **Defaults:** month = January, who's-going = Solo (pace stays Moderate) | `src/components/PlannerForm.tsx` |
| 5 | **"Surprise Me"** returns a **diverse, randomized** set (beaches/plains/forests, not all mountains) | `PlannerForm.tsx` + `src/app/api/recommend/route.ts` + `src/lib/recommend.ts` |

---

## Change 1 — "View sample trip" → random of the 4 samples

**Current:** `src/app/page.tsx:113` hardcodes `<Link href="/sample/ladakh">`. The 4 sample itineraries
exist in `src/data/sampleItineraries.ts` with slugs **`ladakh`, `kerala`, `varanasi`, `andaman`**
(exported as `sampleList`). *(Note: you mentioned "Ahmedabad" — there is no Ahmedabad sample today; the
four are Ladakh/Kerala/Varanasi/Andaman. To add a 5th, author another entry in `sampleItineraries.ts` —
optional, see end.)*

**Fix:** `page.tsx` is already a client component (`'use client'`). Replace the hardcoded `Link` with a
button that picks a random slug **on click** (compute randomness in the handler, never during render —
avoids React hydration mismatch) and navigates:

```tsx
import { useRouter } from 'next/navigation';
import { sampleItineraries } from '@/data/sampleItineraries';
// inside HomePage():
const router = useRouter();
const viewRandomSample = () => {
  const slugs = Object.keys(sampleItineraries);            // ['ladakh','kerala','varanasi','andaman']
  const slug = slugs[Math.floor(Math.random() * slugs.length)];
  router.push(`/sample/${slug}`);
};
```
```tsx
// replace the <Link href="/sample/ladakh"> button (line 112-115) with:
<button onClick={viewRandomSample} className="btn-terracotta text-lg px-8 py-4 w-full sm:w-auto font-semibold">
  View sample trip <ArrowRight className="w-4 h-4 inline" />
</button>
```

**Acceptance:** pressing "View sample trip" multiple times lands on different sample itineraries
(Ladakh / Kerala / Varanasi / Andaman), distributed randomly — never always Ladakh.

---

## Change 2 — Populate ALL Indian cities in the dropdown

**Current:** `src/data/indianCities.ts` holds only ~50 metros (`{ name, state, lat, lng }[]`). Users
can't find tier-2/tier-3 towns.

> **Why this source (researched & measured):** **GeoNames `cities5000` filtered to India = 6,522
> cities/towns** with name, state, lat, lng — covers district HQs and tier-2/3 towns while excluding the
> ~550k zero-population villages in the raw dump. License **CC-BY 4.0 (attribution only, no share-alike)**
> — clean for a commercial app. Minified (`{name,state,lat,lng}`, coords at 4 dp) it's ~346 KB raw /
> **~94 KB gzipped** — safe to bundle if **lazy-loaded**. (Move to a server search API only past ~10–20k
> entries.) Simpler alternative: **dr5hn India CSV (~4,198 cities, clean state names, zero prep)** but
> ODbL *share-alike*.

### 2a. Generate the data file (one-time script)
Add `scripts/build-india-cities.mjs` and run it with `node scripts/build-india-cities.mjs`:

```js
// Downloads GeoNames cities5000, filters to India, joins admin1 → state names,
// writes src/data/indianCities.ts (minified, deduped, sorted by population desc).
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const B = 'https://download.geonames.org/export/dump';
execSync(`curl -sL ${B}/cities5000.zip -o /tmp/c.zip && unzip -o /tmp/c.zip -d /tmp`);
execSync(`curl -sL ${B}/admin1CodesASCII.txt -o /tmp/admin1.txt`);

const admin1 = new Map();                       // "IN.21" -> "Maharashtra"
for (const line of (await import('node:fs')).readFileSync('/tmp/admin1.txt','utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code?.startsWith('IN.')) admin1.set(code, name);
}

const rows = (await import('node:fs')).readFileSync('/tmp/cities5000.txt','utf8').split('\n');
const cities = [];
for (const r of rows) {
  const c = r.split('\t');                       // GeoNames columns (0-indexed)
  if (c[8] !== 'IN') continue;                   // col 8 = countryCode
  const name = c[1], lat = +c[4], lng = +c[5];   // 1=name, 4=lat, 5=lng
  const state = admin1.get(`IN.${c[10]}`) || ''; // 10=admin1 code, 14=population
  if (!name || !state || Number.isNaN(lat)) continue;
  cities.push({ name, state, lat: +lat.toFixed(4), lng: +lng.toFixed(4), pop: +c[14] || 0 });
}
// Dedupe by name+state, sort by population desc (popular cities first → good default list)
const seen = new Set();
const out = cities.filter(c => { const k = `${c.name}|${c.state}`; if (seen.has(k)) return false; seen.add(k); return true; })
                  .sort((a,b) => b.pop - a.pop)
                  .map(({name,state,lat,lng}) => ({ name, state, lat, lng }));

writeFileSync('src/data/indianCities.ts',
`// Auto-generated from GeoNames cities5000 (CC-BY 4.0). Do not edit by hand.
// Regenerate: node scripts/build-india-cities.mjs
export interface IndianCity { name: string; state: string; lat: number; lng: number }
export const indianCities: IndianCity[] = ${JSON.stringify(out)};
`);
console.log(`Wrote ${out.length} cities`);
```
- Keep the **`IndianCity` interface unchanged** so `CityCombobox`/`PlannerForm` need no type changes.
- **Sorted by population desc** so the combobox's "first 8 on focus" default shows the biggest cities.
- **Add attribution:** a line in the footer/about — *"Geographic data © GeoNames (CC-BY 4.0)"*.
- *Simpler alternative:* download `https://github.com/dr5hn/countries-states-cities-database/releases/latest/download/cities.csv`, filter `country_code === 'IN'`, map to `{name, state_name→state, latitude→lat, longitude→lng}`. Zero admin1 join, but credit dr5hn (ODbL).

### 2b. Lazy-load the data in the combobox (keep `/plan` light)
`src/data/indianCities.ts` is imported statically in `PlannerForm.tsx` (line 10). With ~6,500 entries,
load it on demand instead so it isn't in the initial render path:

```tsx
// In CityCombobox (or PlannerForm), load once on mount:
const [cities, setCities] = useState<IndianCity[]>([]);
useEffect(() => { import('@/data/indianCities').then(m => setCities(m.indianCities)); }, []);
// pass `cities` to the combobox's items; before load, items=[] (placeholder still typeable)
```
(Client-side substring search over 6,500 items is instant — no API needed at this size.)

**Acceptance:** the city dropdown surfaces thousands of Indian towns (e.g. "Ratlam", "Hubballi",
"Aizawl", "Port Blair") with correct state + coordinates; typing filters across the full list; the
`/plan` page bundle isn't bloated (data is code-split/lazy-loaded); footer shows the data credit.

---

## Change 3 — Editable number inputs for Budget & Days

**Current:** `src/components/PlannerForm.tsx` — Budget is a `type="range"` slider (≈ lines 188–204,
min 3000 / max 200000 / step 1000) with a read-only value display; Days is a `type="range"` slider
(min 1 / max 14) with a read-only display. Sliders alone are tedious for precise values.

**Fix:** keep each slider **and** add a synced number input bound to the same state (two-way), clamped to
the slider's min/max. Example for Budget (apply the analogous change to Days):

```tsx
{/* Budget */}
<label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
  <IndianRupee className="w-4 h-4 text-brand" /> Total Budget
</label>
<div className="flex items-center gap-3">
  <input type="range" min={3000} max={200000} step={1000} value={budget}
         onChange={(e) => setBudget(Number(e.target.value))} className="flex-1 accent-brand" />
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
    <input type="number" min={3000} max={200000} step={1000} value={budget}
           onChange={(e) => {
             const v = Number(e.target.value);
             setBudget(Math.min(200000, Math.max(3000, isNaN(v) ? 3000 : v)));
           }}
           className="w-32 border-2 border-gray-200 rounded-xl pl-7 pr-2 py-2 text-sm font-semibold
                      text-center focus:outline-none focus:border-brand" />
  </div>
</div>
```
- Days: same pattern, a `type="number"` `min={1} max={14}` next to the days slider, clamped.
- Both stay in sync because the slider and number input share the same state (`budget` / `days`).
- Clamp on blur/change so out-of-range typed values snap into bounds.

**Acceptance:** users can either drag the slider OR type an exact budget/number-of-days; the two stay in
sync; typed values are clamped to the allowed range (₹3,000–₹200,000; 1–14 days).

---

## Change 4 — Defaults: January + Solo (Moderate stays)

**Current** (`PlannerForm.tsx`):
- `const [month, setMonth] = useState(new Date().getMonth() + 1);` (line 53) → defaults to current month.
- `const [groupType, setGroupType] = useState('couple');` (line 55) and
  `const [partySize, setPartySize] = useState(defaultPartySize('couple'));` (line 56).
- `const [pace, setPace] = useState('moderate');` (line 57) — already correct.

**Fix:**
```tsx
const [month, setMonth] = useState(1);                         // January
const [groupType, setGroupType] = useState('solo');            // Solo
const [partySize, setPartySize] = useState(defaultPartySize('solo')); // = 1
// pace stays 'moderate' — no change
```

**Acceptance:** on first load of the planner, **January** is the selected month, **Solo** is the
selected group (party size 1), and pace is **Moderate**.

---

## Change 5 — "Surprise Me" returns a diverse, randomized set

**Current:** `handleSurpriseMe` (`PlannerForm.tsx` lines 79–94) submits with empty scenery/experience.
The recommender then ranks purely by season/budget/proximity/rating, which — from a Delhi origin —
clusters the top 8 into nearby **mountain** destinations every time. Result: monotonous, all-mountains.

**Goal:** each "Surprise Me" press shows a **varied mix** across scenery types (mountains, beach, forest,
plains/lake, desert, backwaters) — e.g. Ladakh, Andaman, Goa, Udaipur, Rishikesh — and **changes** on
repeat presses.

**Fix — server-side diversification + randomness (recommended):**

1. **Client:** `handleSurpriseMe` sends a `surprise: true` flag:
   ```tsx
   onSubmit({ ...sameInputs, scenery: [], experience: [], surprise: true });
   ```
   Add `surprise?: boolean` to `TripInputsState` (`src/app/plan/page.tsx`) and include it in the
   `/api/recommend` POST body (it already forwards the whole object).

2. **Route (`src/app/api/recommend/route.ts`):** when `body.surprise` is true:
   - **Skip the cache** (both Redis and Mongo `RecommendationCache`) so each press is fresh — otherwise
     it caches one result and goes monotonous again.
   - After building the candidate pool, instead of returning the top-N by score, call a new
     `diversifyByScenery(candidates, inputs, TOP_N)` and return its output.

3. **`src/lib/recommend.ts`** — add a diversifier that buckets by primary scenery, picks the best from
   each bucket round-robin, with light randomness:
   ```ts
   export function diversifyByScenery(
     candidates: DestinationDoc[], inputs: TripInputs, limit = 8,
   ): ScoredDestination[] {
     const scored = scoreDestinations(candidates, inputs);          // reuse existing scorer
     // group by primary scenery tag
     const buckets = new Map<string, ScoredDestination[]>();
     for (const s of scored) {
       const key = s.destination.scenery?.[0] ?? 'other';
       (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(s);
     }
     // within each bucket keep top few, then round-robin across buckets for variety
     const order = shuffle([...buckets.keys()]);                    // randomize category order each call
     const picks: ScoredDestination[] = [];
     let i = 0;
     while (picks.length < limit && order.some(k => (buckets.get(k)?.length ?? 0) > 0)) {
       const k = order[i % order.length];
       const arr = buckets.get(k);
       if (arr?.length) {
         // pick randomly among the top 3 of this category so repeats vary
         const top = arr.splice(0, Math.min(3, arr.length));
         const chosen = top.splice(Math.floor(Math.random() * top.length), 1)[0];
         picks.push(chosen);
         arr.unshift(...top);                                       // put the unpicked back
       }
       i++;
     }
     return picks;
   }
   function shuffle<T>(a: T[]): T[] { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
   ```
   This guarantees the result spans multiple scenery categories (so not all mountains) and the
   randomness (shuffled category order + random pick among each category's top 3) makes every press
   different. `Math.random()` is fine here — this is server route code, not a workflow script.

4. The normal (non-surprise) flow is unchanged — still ranked by score and cached.

**Acceptance:** pressing "Surprise Me" shows a **mix** of destination types (at least 3–4 different
scenery categories among the cards — e.g. a beach, a hill station, a lake/heritage city, a forest),
and the set **changes** on repeated presses; the normal "Find My Destinations" path is unaffected and
still cached.

---

## Files touched & suggested order
1. `scripts/build-india-cities.mjs` (new) → run it to regenerate `src/data/indianCities.ts` (~6,500 cities).
2. `src/components/CityCombobox.tsx` (or `PlannerForm.tsx`) — lazy-load the cities data.
3. `src/components/PlannerForm.tsx` — Budget/Days number inputs (Change 3); defaults Jan + Solo (Change 4);
   `handleSurpriseMe` sends `surprise: true` (Change 5).
4. `src/app/plan/page.tsx` — add `surprise?: boolean` to `TripInputsState`.
5. `src/app/api/recommend/route.ts` — surprise branch: skip cache + `diversifyByScenery`.
6. `src/lib/recommend.ts` — add `diversifyByScenery` + `shuffle`.
7. `src/app/page.tsx` — random "View sample trip" (Change 1).
8. Add the GeoNames credit to the footer. Run `npm run build` + `npm run lint`; verify each Acceptance block.

## Optional (only if you want it)
- **5th sample (Ahmedabad):** to include Ahmedabad in the random "View sample trip", author a new entry in
  `src/data/sampleItineraries.ts` (slug `'ahmedabad'`, add `'ahmedabad'` to the slug union, full days/
  budget/packing), add a `/public/destinations/ahmedabad.jpg`, and it's automatically picked up by the
  random selector and the homepage cards.

## Out of scope / keep intact
- No change to the itinerary-generation/caching, the recommendation scoring weights, or the auth flows.
- Keep the brand palette, fonts, and the `IndianCity` interface shape (so no downstream type churn).
- Surprise-Me skips caching **only** for surprise requests; normal requests stay cached.

## Research sources
GeoNames data export & CC-BY license (geonames.org/export, download.geonames.org/export/dump/readme.txt);
dr5hn countries-states-cities-database (GitHub, ODbL); SimpleMaps India (MIT, ~385). Bundle-size figures
measured from the live dumps (~6,500 entries ≈ 94 KB gzipped).
