// Explicit maintenance command; normal builds use the committed, offline snapshot.
const fs = require('node:fs');
const crypto = require('node:crypto');
const cities = require('all-the-cities').map(c => [c.cityId, c.name, c.country, ...c.loc.coordinates]);
if (cities.length !== 135233 || new Set(cities.map(c => c[0])).size !== cities.length) throw Error('Unexpected GeoNames snapshot');
const contents = JSON.stringify(cities);
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/cities.json', contents + '\n');
fs.writeFileSync('public/data/manifest.json', JSON.stringify({
  count: cities.length, schema: ['geonameId', 'name', 'countryCode', 'longitude', 'latitude'],
  source: 'GeoNames cities1000 via all-the-cities@3.1.0',
  sourceUrl: 'https://www.geonames.org/', packageVersion: '3.1.0',
  license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sha256: crypto.createHash('sha256').update(contents + '\n').digest('hex'),
}, null, 2) + '\n');
console.log(`Vendored ${cities.length.toLocaleString()} cities`);
