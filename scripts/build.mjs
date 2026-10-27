import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const data = await readFile('public/data/cities.json');
const manifest = JSON.parse(await readFile('public/data/manifest.json', 'utf8'));
const cities = JSON.parse(data);
if (createHash('sha256').update(data).digest('hex') !== manifest.sha256 || cities.length !== manifest.count || new Set(cities.map(c => c[0])).size !== cities.length) throw Error('City snapshot integrity check failed');
if (cities.some(c => !Number.isInteger(c[0]) || !c[1] || !/^[A-Z]{2}$/.test(c[2]) || !Number.isFinite(c[3]) || Math.abs(c[3]) > 180 || !Number.isFinite(c[4]) || Math.abs(c[4]) > 90)) throw Error('Invalid city record');
// pick.js is a browser ES module; importing its source via a data URL also lets
// the Node build validate the identical seven-column schema without a bundler.
const pickSource = await readFile('public/pick.js', 'utf8');
const { validatePools } = await import(`data:text/javascript;base64,${Buffer.from(pickSource).toString('base64')}`);
const poolData = await readFile('public/data/pools.json');
const poolManifest = JSON.parse(await readFile('public/data/pools-manifest.json', 'utf8'));
const pools = validatePools(JSON.parse(poolData));
const sourceIds = new Set(cities.map(city => city[0]));
const pooledCities = Object.values(pools).flat();
if (createHash('sha256').update(poolData).digest('hex') !== poolManifest.sha256 ||
    pooledCities.length !== poolManifest.count || pooledCities.some(city => !sourceIds.has(city[0])) ||
    Object.entries(pools).some(([tier, rows]) => rows.length !== poolManifest.counts[tier])) throw Error('Pool snapshot integrity check failed');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log(`Built static site; verified ${cities.length} unique GeoNames cities and SHA-256.`);
console.log(`Verified ${pooledCities.length} eligible pooled cities: ${JSON.stringify(poolManifest.counts)}`);
