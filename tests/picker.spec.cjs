const { test, expect } = require('@playwright/test');

test('pickCity honors tier weights and reweights exhausted tiers', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
  const result = await page.evaluate(async () => {
    const { pickCity, TIER_WEIGHTS } = await import('./pick.js');
    const pools = Object.fromEntries(Object.keys(TIER_WEIGHTS).map((tier, i) => [tier, [[i + 1, tier, 'KR', '', 37, 127, 20000]]]));
    const original = crypto.getRandomValues;
    let values;
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value(array) { array[0] = Math.floor(values.shift() * 4294967296); return array; } });
    const sample = (value, drawn = []) => { values = [value, 0]; return pickCity(pools, drawn)?.tier; };
    try {
      return {
        weights: TIER_WEIGHTS,
        // One sample at the midpoint of every 1% interval: exact 25/45/25/5 split.
        tiers: Array.from({ length: 100 }, (_, i) => sample((i + 0.5) / 100)),
        withoutFamous: Array.from({ length: 75 }, (_, i) => sample((i + 0.5) / 75, [1])),
        dangerOnly: sample(0, [1, 2, 3]),
        empty: sample(0, [1, 2, 3, 4]),
        stringIds: sample(0, ['1', '2', '3']),
      };
    } finally { Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: original }); }
  });
  const counts = values => Object.fromEntries(['famous', 'mid', 'small', 'danger'].map(tier => [tier, values.filter(value => value === tier).length]));
  expect(counts(result.tiers)).toEqual({ famous: 25, mid: 45, small: 25, danger: 5 });
  expect(counts(result.withoutFamous)).toEqual({ famous: 0, mid: 45, small: 25, danger: 5 });
  expect(result.dangerOnly).toBe('danger');
  expect(result.empty).toBeUndefined();
  expect(result.stringIds).toBe('danger');
});

test('old history survives and excluded cities never return; coordinates retain their ordering', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
  await page.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    await (await new TravelStore().open()).claim([3039154, 'El Tarter', 'AD', 1.65362, 42.57952]);
  });
  // Tiny fixture with one already-drawn legacy ID; only a danger city remains.
  await page.route('**/data/pools.json', route => route.fulfill({ json: {
    famous: [[3039154, 'El Tarter', 'AD', '', 42.58, 1.654, 20000]],
    mid: [], small: [], danger: [[1138958, 'Kabul', 'AF', '13', 34.528, 69.173, 3500000]],
  } }));
  await page.reload();
  await expect(page.locator('#remaining-count')).toHaveText('1');
  await expect(page.locator('#history-count')).toHaveText('01');
  await expect(page.locator('.history-list')).toContainText('El Tarter');
  await page.locator('#pick-button').click();
  await page.locator('#pick-button').click();
  await expect(page.locator('#button-label')).toHaveText('다음 여행 START');
  await expect(page.locator('#city-name')).toHaveText('Kabul');
  await expect(page.locator('#country')).toContainText('AF');
  await expect(page.locator('#coordinates')).toHaveText('34.528° N  /  69.173° E');
  const result = await page.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    return (await (await new TravelStore().open()).all());
  });
  expect(result).toHaveLength(2);
  expect(result.find(r => r.id === 1138958).city).toEqual([1138958, 'Kabul', 'AF', 69.173, 34.528]);
});

test('concurrent STOP on the last city saves exactly once and finishes both tabs', async ({ context, page }) => {
  await context.route('**/data/pools.json', route => route.fulfill({ json: {
    famous: [[2988507, 'Paris', 'FR', '11', 48.853, 2.349, 2000000]],
    mid: [], small: [], danger: [],
  } }));
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('./');
    await expect(tab.locator('#button-label')).toHaveText('START');
  }
  await Promise.all([page, other].map(tab => tab.evaluate(() => {
    document.querySelector('#pick-button').click();
    document.querySelector('#pick-button').click();
  })));
  await expect.poll(async () => Promise.all([page, other].map(tab => tab.locator('#button-label').textContent()))).toContain('모두 뽑았어요');
  const result = await page.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    return (await (await new TravelStore().open()).all());
  });
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe(2988507);
  await expect(page.locator('#error-box')).toBeHidden();
  await expect(other.locator('#error-box')).toBeHidden();
});

test('corrupt pooled data fails safely and retry restores the picker', async ({ page }) => {
  await page.route('**/data/pools.json', route => route.fulfill({ json: { famous: [], mid: [], small: [], danger: [] } }));
  await page.goto('./');
  await expect(page.locator('#error-box')).toBeVisible();
  await expect(page.locator('#pick-button')).toBeDisabled();
  await page.unroute('**/data/pools.json');
  await page.locator('#retry-button').click();
  await expect(page.locator('#button-label')).toHaveText('START');
});

test('the STOP handler uses pickCity tier weighting rather than the display city', async ({ page }) => {
  await page.route('**/data/pools.json', route => route.fulfill({ json: {
    famous: [[1, 'Famous A', 'KR', '', 37, 127, 20000], [2, 'Famous B', 'JP', '', 35, 139, 20000]],
    mid: [[3, 'Mid', 'FR', '', 48, 2, 90000]],
    small: [[4, 'Small', 'DE', '', 52, 13, 20000]],
    danger: [[5, 'Danger', 'AF', '', 34, 69, 20000]],
  } }));
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
  await page.locator('#pick-button').click();
  await page.evaluate(() => {
    const values = [4294967295, 0];
    Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value(array) { array[0] = values.shift() ?? 0; return array; } });
    document.querySelector('#pick-button').click();
  });
  await expect(page.locator('#button-label')).toHaveText('다음 여행 START');
  await expect(page.locator('#city-name')).toHaveText('Danger');
  await expect(page.locator('#country')).toContainText('AF');
});

test('hiding Safari during slowdown does not leave the picker stuck', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
  await page.evaluate(() => {
    document.querySelector('#pick-button').click();
    document.querySelector('#pick-button').click();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#button-label')).toHaveText('다음 여행 START', { timeout: 1000 });
  await expect(page.locator('#history-count')).toHaveText('01');
  await expect(page.locator('#error-box')).toBeHidden();
});
