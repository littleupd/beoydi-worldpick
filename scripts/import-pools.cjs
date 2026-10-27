// Feed the existing pinned GeoNames snapshot (including population/admin fields)
// into the user's unmodified GeoNames-format classifier. No network is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const snapshot = require('all-the-cities');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'worldpick-pools-'));
try {
  const rows = snapshot.map(city => {
    const row = Array(19).fill('');
    row[0] = city.cityId;
    // This package retains the source display name, not a separate ASCII name.
    row[1] = city.name;
    row[4] = city.loc.coordinates[1];
    row[5] = city.loc.coordinates[0];
    row[8] = city.country;
    row[10] = city.adminCode || '';
    row[14] = city.population;
    return row.join('\t');
  });
  const input = path.join(temporary, 'cities1000.txt');
  fs.writeFileSync(input, rows.join('\n') + '\n');
  execFileSync('python3', [path.resolve('scripts/build_pools.py'), input], { cwd: temporary, stdio: 'inherit' });
  const data = fs.readFileSync(path.join(temporary, 'pools.json'));
  const pools = JSON.parse(data);
  const counts = Object.fromEntries(Object.entries(pools).map(([tier, cities]) => [tier, cities.length]));
  fs.writeFileSync('public/data/pools.json', data);
  fs.writeFileSync('public/data/pools-manifest.json', JSON.stringify({
    source: 'GeoNames cities1000 via all-the-cities@3.1.0',
    sourceCount: snapshot.length,
    classifier: 'scripts/build_pools.py (user supplied)',
    sourceNameField: 'Original display name; this package has no separate GeoNames ASCII-name field',
    schema: ['geonameId', 'name', 'countryCode', 'admin1', 'latitude', 'longitude', 'population'],
    counts,
    count: Object.values(counts).reduce((sum, count) => sum + count, 0),
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  }, null, 2) + '\n');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
