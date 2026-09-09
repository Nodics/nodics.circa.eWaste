import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Browser-only coordinates are simulated; this check never reads the operator's location.
const browser = await chromium.launch();
const origin = process.env.CIRCA_URL || 'http://localhost:3600';
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ['geolocation'],
  geolocation: { latitude: 25.2048, longitude: 55.2708 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(origin);
  const share = page.getByRole('button', { name: 'Find centres near me', exact: true });
  await share.waitFor();
  const marker = page.getByRole('img', { name: 'Your current location', exact: true });
  assert.equal(await marker.count(), 0, 'No position is rendered before sharing');
  await share.click();
  await marker.waitFor();
  await page.waitForTimeout(700);
  assert.equal(await marker.count(), 1);
  assert.match(await marker.innerText(), /You/);
  const visibleInMap = async () => {
    const mapBox = await page.locator('[data-map-provider]').boundingBox();
    const pinBox = await marker.boundingBox();
    assert(mapBox && pinBox && pinBox.x >= mapBox.x && pinBox.y >= mapBox.y &&
      pinBox.x + pinBox.width <= mapBox.x + mapBox.width &&
      pinBox.y + pinBox.height <= mapBox.y + mapBox.height, 'The shared pin must be inside the map viewport');
  };
  await visibleInMap();
  // Centre filtering must not remove the independently shared location.
  await page.getByRole('button', { name: 'Repair', exact: true }).click();
  assert.equal(await marker.count(), 1);
  await page.getByRole('button', { name: 'Expand map', exact: true }).click();
  await page.waitForTimeout(300);
  await visibleInMap();
  await context.setGeolocation({ latitude: 25.21, longitude: 55.28 });
  await share.click();
  await page.waitForTimeout(700);
  assert.equal(await marker.count(), 1, 'Sharing again replaces the previous pin');
  await visibleInMap();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await visibleInMap();
  if (process.env.CIRCA_MAP_SCREENSHOT) await page.screenshot({ path: process.env.CIRCA_MAP_SCREENSHOT });

  const denied = await browser.newContext();
  const deniedPage = await denied.newPage();
  await deniedPage.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition: (_success, failure) => failure({ code: 1, message: 'Permission denied' }),
    } });
  });
  await deniedPage.goto(origin);
  await deniedPage.getByRole('button', { name: 'Find centres near me', exact: true }).click();
  await deniedPage.getByText('Location was not shared. Search or choose a centre below.', { exact: true }).waitFor();
  assert.equal(await deniedPage.getByRole('img', { name: 'Your current location', exact: true }).count(), 0);
  await denied.close();
  assert.deepEqual(errors, []);
  console.log('Location pin verified: sharing, repeat sharing, filters, expansion, mobile and permission denial.');
} finally {
  await browser.close();
}
