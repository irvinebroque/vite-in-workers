import { test, expect } from '@playwright/test';
import { assetProject } from './fixtures.js';

test('edit, build, interact, rebuild, report errors, and isolate preview', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Ready to build');
  await page.getByLabel('Build token').fill(process.env.BUILD_TOKEN ?? 'local-demo');
  await page.getByRole('button', { name: 'Build & preview' }).click();
  await expect(page.getByRole('status')).toContainText('Cloudflare-Workers');
  const frame = page.frameLocator('#preview');
  await expect(frame.getByRole('heading')).toHaveText('My task board');
  await frame.getByRole('button').click();
  await expect(frame.getByRole('button')).toHaveClass('task done');
  await expect(frame.getByRole('button')).toHaveCSS('background-color', 'rgb(212, 238, 224)');
  await page.screenshot({ path: `reports/preview-${process.env.BUILD_URL ? 'hosted' : 'local'}.png`, fullPage: true });

  const preview = page.frames().find(f => f.url().includes('/preview/'));
  expect(await preview.evaluate(() => {
    try { return parent.document.body.innerText; } catch { return 'blocked'; }
  })).toBe('blocked');
  expect(await preview.evaluate(async () => {
    try { await fetch('/example'); return 'allowed'; } catch { return 'blocked'; }
  })).toBe('blocked');
  expect(await preview.evaluate(() => {
    try { return localStorage.length; } catch { return 'blocked'; }
  })).toBe('blocked');

  await page.getByLabel('Source file').selectOption('title.ts');
  await page.getByLabel('Edit source').fill('export const title = "Built from an edit";');
  await page.getByRole('button', { name: 'Build & preview' }).click();
  await expect(frame.getByRole('heading')).toHaveText('Built from an edit');
  const savedPreview = await page.locator('#preview').getAttribute('src');
  await page.getByLabel('Source file').selectOption('main.tsx');
  await page.getByLabel('Edit source').fill('const broken: = 1;');
  await page.getByRole('button', { name: 'Build & preview' }).click();
  await expect(page.getByRole('alert')).toContainText('main.tsx:1:');
  await expect(page.getByRole('status')).toContainText('Build failed');
  expect(await page.locator('#preview').getAttribute('src')).toBe(savedPreview);
  await expect(frame.getByRole('heading')).toHaveText('Built from an edit');
  await page.reload();
  await page.getByLabel('Source file').selectOption('title.ts');
  await expect(page.getByLabel('Edit source')).toHaveValue('export const title = "Built from an edit";');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByLabel('Source file')).toHaveValue('index.html');
  await page.getByLabel('Source file').selectOption('title.ts');
  await expect(page.getByLabel('Edit source')).toHaveValue(/My task board/);
  expect(errors).toEqual([]);
});

test('split chunks, JSON, SVG, and CSS work in a direct preview', async ({ page, request }) => {
  const response = await request.post('/build', {
    headers: { authorization: `Bearer ${process.env.BUILD_TOKEN ?? 'local-demo'}` }, data: assetProject
  });
  expect(response.ok()).toBe(true);
  const bundle = await response.json();
  await page.goto(bundle.preview);
  await expect(page.locator('#root')).toHaveText('JSON import works');
  await expect(page.locator('body')).toHaveAttribute('data-loaded', 'yes');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(0, 128, 0)');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(240, 245, 250)');
  const icon = await page.locator('body').getAttribute('data-icon');
  const asset = await request.get(new URL(icon, page.url()).href);
  expect(asset.headers()['content-type']).toContain('image/svg+xml');
  expect(await asset.text()).toContain('<circle');
  expect(await page.evaluate(() => {
    try { return localStorage.length; } catch { return 'blocked'; }
  })).toBe('blocked');
});
