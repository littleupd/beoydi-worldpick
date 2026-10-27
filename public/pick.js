// 비여디 지구뽑기 - 구간 가중 뽑기
// pools.json 을 불러와서 "구간 먼저 -> 구간 안에서 도시" 순서로 뽑아요.
// 이미 뽑힌 도시(drawnIds)는 제외돼요.

export const TIER_WEIGHTS = {
  famous: 25, // 유명 관광 도시
  mid: 45,    // 중간 도시
  small: 25,  // 작은 도시/마을
  danger: 5,  // 위험·오지 (소개만 하는 편)
};

// 암호학적 난수 (0 이상 1 미만)
function rand() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

export async function loadPools(url = new URL('./data/pools.json', import.meta.url), options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return validatePools(await res.json());
}

// Keep invalid snapshots from enabling a partially broken draw.
export function validatePools(pools) {
  const ids = new Set();
  if (!pools || typeof pools !== 'object') throw new Error('Invalid city pools');
  for (const tier of Object.keys(TIER_WEIGHTS)) {
    if (!Array.isArray(pools[tier])) throw new Error(`Missing city pool: ${tier}`);
    for (const city of pools[tier]) {
      if (!Array.isArray(city) || city.length !== 7 || !Number.isInteger(city[0]) || city[0] <= 0 ||
          typeof city[1] !== 'string' || !city[1].trim() || !/^[A-Z]{2}$/.test(city[2]) ||
          typeof city[3] !== 'string' || !Number.isFinite(city[4]) || Math.abs(city[4]) > 90 ||
          !Number.isFinite(city[5]) || Math.abs(city[5]) > 180 || !Number.isInteger(city[6]) || city[6] < 0 || ids.has(city[0])) {
        throw new Error('Invalid or duplicate pooled city');
      }
      ids.add(city[0]);
    }
  }
  if (!ids.size) throw new Error('Empty city snapshot');
  return pools;
}

function pickTier(pools, drawn) {
  // 남은 도시가 없는 구간은 확률에서 제외
  const entries = Object.entries(TIER_WEIGHTS).filter(([t]) =>
    pools[t].some((c) => !drawn.has(c[0]))
  );
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = rand() * total;
  for (const [tier, w] of entries) {
    if ((r -= w) < 0) return tier;
  }
  return entries[entries.length - 1][0];
}

// drawnIds: 이미 뽑은 geonameid 배열
export function pickCity(pools, drawnIds = []) {
  const drawn = new Set(drawnIds.map(Number));
  const tier = pickTier(pools, drawn);
  if (!tier) return null;
  const candidates = pools[tier].filter((c) => !drawn.has(c[0]));
  const c = candidates[Math.floor(rand() * candidates.length)];
  const [id, name, cc, admin1, lat, lon, pop] = c;
  return { id, name, cc, admin1, lat, lon, pop, tier };
}

// 도시 이름이 돌아가는 연출용(결과와 무관한 표시용 목록)
export function spinnerNames(pools, n = 40) {
  let all = [...pools.famous, ...pools.mid, ...pools.small];
  if (!all.length) all = pools.danger;
  if (!all.length) return [];
  return Array.from({ length: n }, () => {
    const c = all[Math.floor(rand() * all.length)];
    return `${c[1]}, ${c[2]}`;
  });
}
