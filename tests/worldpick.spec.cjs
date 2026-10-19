const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
}
async function draw(page) {
  await page.locator('#pick-button').click();
  await expect(page.locator('#button-label')).toHaveText('STOP');
  await page.waitForTimeout(180);
  const displayed = await page.locator('#city-name').textContent();
  await page.locator('#pick-button').click();
  await expect(page.locator('#button-label')).toHaveText('NEXT TRIP');
  return displayed;
}
async function records(page) {
  return page.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    return (await (await new TravelStore().open()).all());
  });
}

test('full local dataset, START/STOP, reload persistence and unique draws', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const total = Number((await page.locator('#total-stat').textContent()).replaceAll(',', ''));
  expect(total).toBe(135233);
  for (let i = 0; i < 8; i++) await draw(page);
  const saved = await records(page);
  expect(saved).toHaveLength(8);
  expect(new Set(saved.map(r => r.id)).size).toBe(8);
  await page.reload();
  await expect(page.locator('#button-label')).toHaveText('START');
  await expect(page.locator('#history-count')).toHaveText('08');
  await expect(page.locator('#remaining-count')).toHaveText('135,225');
  await draw(page);
  expect(await records(page)).toHaveLength(9);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('stopping commits the currently displayed city', async ({ page }) => {
  await ready(page);
  // Programmatic activation runs in the same event loop turn as reading the displayed name.
  const city = await page.evaluate(() => {
    document.querySelector('#pick-button').click();
    const name = document.querySelector('#city-name').textContent;
    document.querySelector('#pick-button').click();
    return name;
  });
  await expect(page.locator('#button-label')).toHaveText('NEXT TRIP');
  await expect(page.locator('#city-name')).toHaveText(city);
  expect((await records(page))[0].city[1]).toBe(city);
});

test('failed city request offers retry, never an endless loader', async ({ page }) => {
  await page.route('**/data/cities.json', route => route.fulfill({ status: 503, body: 'offline' }));
  await page.goto('./');
  await expect(page.locator('#error-box')).toBeVisible();
  await expect(page.locator('#button-label')).toHaveText('PAUSED');
  await page.unroute('**/data/cities.json');
  await page.locator('#retry-button').click();
  await expect(page.locator('#button-label')).toHaveText('START');
});

test('storage failure blocks unsaved draws and recovers', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    window.originalClaim = TravelStore.prototype.claim;
    TravelStore.prototype.claim = async () => { throw new Error('QuotaExceededError'); };
  });
  await page.locator('#pick-button').click();
  await page.locator('#pick-button').click();
  await expect(page.locator('#error-box')).toBeVisible();
  await expect(page.locator('#pick-button')).toBeDisabled();
  expect(await records(page)).toHaveLength(0);
  await page.evaluate(async () => { const { TravelStore } = await import('./store.js'); TravelStore.prototype.claim = window.originalClaim; });
  await page.locator('#retry-button').click();
  await expect(page.locator('#button-label')).toHaveText('START');
  await draw(page);
  expect(await records(page)).toHaveLength(1);
});

test('atomic claims from concurrent tabs cannot save the same city twice', async ({ context, page }) => {
  await ready(page);
  const other = await context.newPage();
  await ready(other);
  const attempt = p => p.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    const db = await new TravelStore().open();
    return db.claim([3039154, 'El Tarter', 'AD', 1.65362, 42.57952]);
  });
  const result = await Promise.all([attempt(page), attempt(other)]);
  expect(result.sort()).toEqual([false, true]);
  expect(await records(page)).toHaveLength(1);
});

test('last remaining city is drawn once and exhaustion disables further draws', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const cities = await (await fetch('./data/cities.json')).json();
    const { TravelStore } = await import('./store.js');
    const store = await new TravelStore().open();
    await new Promise((resolve, reject) => {
      const tx = store.db.transaction('draws', 'readwrite');
      for (const city of cities.slice(1)) tx.objectStore('draws').add({ id: city[0], city, time: 0 });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
  });
  await page.reload();
  await expect(page.locator('#remaining-count')).toHaveText('1');
  await draw(page);
  await expect(page.locator('#remaining-count')).toHaveText('0');
  await page.locator('#pick-button').click();
  await expect(page.locator('#button-label')).toHaveText('ALL EXPLORED');
  await expect(page.locator('#pick-button')).toBeDisabled();
});

test('reduced motion and keyboard input remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.locator('#pick-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#button-label')).toHaveText('STOP');
  await page.keyboard.press('Enter');
  await expect(page.locator('#announcement')).toContainText('여행지 확정');
});

test('no third-party request is needed to load or draw', async ({ page }) => {
  const thirdParty = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/')) thirdParty.push(request.url()); });
  await ready(page);
  await draw(page);
  expect(thirdParty).toEqual([]);
});

test('a stalled city download times out with a retry button', async ({ page }) => {
  await page.route('**/data/cities.json', () => {});
  await page.goto('./');
  await expect(page.locator('#error-box')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('#button-label')).toHaveText('PAUSED');
  await expect(page.locator('#retry-button')).toBeEnabled();
});

test('denied IndexedDB access never enables nonpersistent draws', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('SecurityError'); } }); });
  await page.goto('./');
  await expect(page.locator('#error-box')).toBeVisible();
  await expect(page.locator('#pick-button')).toBeDisabled();
  await expect(page.locator('#error-message')).toContainText('중복 방지');
});
