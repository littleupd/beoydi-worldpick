const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('./');
  await expect(page.locator('#button-label')).toHaveText('START');
}

async function draw(page) {
  await page.locator('#pick-button').click();
  await page.locator('#pick-button').click();
  await expect(page.locator('#button-label')).toHaveText('다음 여행 START');
}

test('reset confirmation can be cancelled without losing records', async ({ page }) => {
  await ready(page);
  await draw(page);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#reset-history').click();
  await expect(page.locator('#history-count')).toHaveText('01');
  await page.reload();
  await expect(page.locator('#history-count')).toHaveText('01');
});

test('confirmed reset persists and makes previously drawn cities eligible again', async ({ page }) => {
  await page.route('**/data/pools.json', route => route.fulfill({ json: {
    famous: [[2988507, 'Paris', 'FR', '11', 48.853, 2.349, 2000000]],
    mid: [], small: [], danger: [],
  } }));
  await ready(page);
  await expect(page.locator('#reset-history')).toBeDisabled();
  await draw(page);
  await expect(page.locator('#remaining-count')).toHaveText('0');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset-history').click();
  await expect(page.locator('#button-label')).toHaveText('START');
  await expect(page.locator('#history-count')).toHaveText('00');
  await expect(page.locator('#remaining-count')).toHaveText('1');
  await expect(page.locator('#history-empty')).toBeVisible();
  await expect(page.locator('#result-comment')).toBeHidden();
  await page.reload();
  await expect(page.locator('#button-label')).toHaveText('START');
  await expect(page.locator('#history-count')).toHaveText('00');
  await draw(page);
  await expect(page.locator('#city-name')).toHaveText('Paris');
  await expect(page.locator('#history-count')).toHaveText('01');
});

test('reset cancels another tab spinning and updates its history', async ({ context, page }) => {
  await ready(page);
  await draw(page);
  const other = await context.newPage();
  await ready(other);
  await expect(other.locator('#history-count')).toHaveText('01');
  await other.locator('#pick-button').click();
  await expect(other.locator('#reset-history')).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset-history').click();
  for (const tab of [page, other]) {
    await expect(tab.locator('#button-label')).toHaveText('START');
    await expect(tab.locator('#history-count')).toHaveText('00');
    await expect(tab.locator('#remaining-count')).toHaveText('24,030');
  }
});

test('a failed reset transaction preserves the history', async ({ page }) => {
  await ready(page);
  await draw(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    window.restoreTransactions = () => { IDBDatabase.prototype.transaction = original; };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') queueMicrotask(() => tx.abort());
      return tx;
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset-history').click();
  await expect(page.locator('#error-message')).toContainText('초기화하지 못했어요');
  await page.evaluate(() => window.restoreTransactions());
  await page.reload();
  await expect(page.locator('#button-label')).toHaveText('START');
  await expect(page.locator('#history-count')).toHaveText('01');
});

test('reset during another tab slowdown cannot restore a cleared result', async ({ context, page }) => {
  await ready(page);
  await draw(page);
  const other = await context.newPage();
  await ready(other);
  await other.locator('#pick-button').click();
  await other.locator('#pick-button').click();
  await expect.poll(() => other.evaluate(async () => {
    const { TravelStore } = await import('./store.js');
    return (await (await new TravelStore().open()).all()).length;
  })).toBe(2);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset-history').click();
  await expect(other.locator('#button-label')).toHaveText('START');
  // Let the original reveal deadline pass: it must not overwrite the reset UI.
  await other.waitForTimeout(1700);
  for (const tab of [page, other]) {
    await expect(tab.locator('#history-count')).toHaveText('00');
    await expect(tab.locator('#button-label')).toHaveText('START');
    await expect(tab.locator('#result-comment')).toBeHidden();
  }
});
