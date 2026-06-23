// scripts/build-india-cities.mjs
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const B = 'https://download.geonames.org/export/dump';
execSync(`curl -sL ${B}/cities5000.zip -o /tmp/c.zip && unzip -o /tmp/c.zip -d /tmp`);
execSync(`curl -sL ${B}/admin1CodesASCII.txt -o /tmp/admin1.txt`);

const admin1 = new Map();
for (const line of (await import('node:fs')).readFileSync('/tmp/admin1.txt','utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code?.startsWith('IN.')) admin1.set(code, name);
}

const rows = (await import('node:fs')).readFileSync('/tmp/cities5000.txt','utf8').split('\n');
const cities = [];
for (const r of rows) {
  const c = r.split('\t');
  if (c[8] !== 'IN') continue;
  const name = c[1], lat = +c[4], lng = +c[5];
  const state = admin1.get(`IN.${c[10]}`) || '';
  if (!name || !state || Number.isNaN(lat)) continue;
  cities.push({ name, state, lat: +lat.toFixed(4), lng: +lng.toFixed(4), pop: +c[14] || 0 });
}
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
