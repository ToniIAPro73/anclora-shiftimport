import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadFixture() {
  return JSON.parse(readFileSync(join(__dirname, '..', 'artifacts', 'invitations-fixture.json'), 'utf8')) as {
    tokensByProject: Record<string, { createToken: string; linkToken: string; visualToken: string }>;
  };
}

const GOLD_HEX = ['#f0ce62', '#c79b16', '#f1d269', '#c58f00'];
const DARK_TEXT_RGB = 'rgb(27, 31, 47)'; // #1b1f2f
const GREEN_ACCENT_HEX = '6aad49';

async function setTheme(page: Page, mode: 'light' | 'dark') {
  await page.evaluate((m) => window.localStorage.setItem('anclora_theme_mode', m), mode);
  await page.reload();
}

async function measure(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
  }));
}

async function expectNoScroll(page: Page, label: string) {
  const m = await measure(page);
  expect(m.scrollWidth, `${label}: no horizontal scroll`).toBeLessThanOrEqual(m.clientWidth);
  expect(m.scrollHeight, `${label}: no vertical scroll`).toBeLessThanOrEqual(m.clientHeight);
}

async function expectGoldCta(page: Page, cta: ReturnType<Page['getByRole']>, label: string) {
  await expect(cta, `${label}: CTA visible`).toBeVisible();
  const box = await cta.boundingBox();
  expect(box, `${label}: CTA has a bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  if (box && viewport) {
    expect(box.x, `${label}: CTA left inside viewport`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${label}: CTA top inside viewport`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${label}: CTA right inside viewport`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height, `${label}: CTA bottom inside viewport`).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.height, `${label}: CTA min height 48px`).toBeGreaterThanOrEqual(47);
  }
  const styles = await cta.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      backgroundImage: computed.backgroundImage,
      color: computed.color,
      paddingLeft: parseFloat(computed.paddingLeft),
      paddingRight: parseFloat(computed.paddingRight),
    };
  });
  expect(styles.color, `${label}: CTA text is the brand dark color, not white`).toBe(DARK_TEXT_RGB);
  expect(styles.backgroundImage.toLowerCase(), `${label}: CTA background is not the green accent`).not.toContain(GREEN_ACCENT_HEX);
  expect(GOLD_HEX.some((hex) => styles.backgroundImage.toLowerCase().includes(hex)), `${label}: CTA uses a real brand gold stop`).toBe(true);
  expect(styles.paddingLeft, `${label}: CTA horizontal padding (left)`).toBeGreaterThanOrEqual(20);
  expect(styles.paddingRight, `${label}: CTA horizontal padding (right)`).toBeGreaterThanOrEqual(20);
  const scrollCheck = await cta.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(scrollCheck, `${label}: CTA text does not overflow its own box`).toBe(true);
}

test.describe('superficie de aceptación — por estado, viewport y tema', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`estados de la invitación en ${theme}`, async ({ page }, testInfo) => {
      const fixture = loadFixture();
      const tokens = fixture.tokensByProject[testInfo.project.name];
      const viewport = testInfo.project.use.viewport as { width: number; height: number };

      // --- cuenta nueva: superficie horizontal proporcionada, <=900px ---
      await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens.createToken)}`);
      if (theme === 'light') await setTheme(page, 'light');
      await expect(page.getByTestId('accept-invitation-screen')).toBeVisible();
      await expect.poll(() => page.url()).toMatch(/\/accept-invitation$/);
      const newCardBox = await page.locator('.invite-card--new').boundingBox();
      expect(newCardBox, `new account @ ${theme}: card present`).not.toBeNull();
      if (newCardBox) expect(newCardBox.width, `new account @ ${theme}: max-width <= 900px`).toBeLessThanOrEqual(901);
      await expect(page.getByText('Aceptar invitación')).toBeVisible();
      await expectGoldCta(page, page.getByRole('button', { name: 'Crear cuenta y aceptar' }), `new account @ ${theme}`);
      await expectNoScroll(page, `new account @ ${theme}`);

      // --- cuenta existente: superficie más compacta, sin columnas artificiales ---
      await page.goto('/login');
      await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens.linkToken)}`);
      if (theme === 'light') await setTheme(page, 'light');
      await expect(page.getByTestId('accept-invitation-screen')).toBeVisible();
      await expect.poll(() => page.url()).toMatch(/\/accept-invitation$/);
      const existingCardBox = await page.locator('.invite-card--existing').boundingBox();
      expect(existingCardBox, `existing account @ ${theme}: card present`).not.toBeNull();
      if (existingCardBox) {
        expect(existingCardBox.width, `existing account @ ${theme}: max-width <= 760px`).toBeLessThanOrEqual(761);
        if (newCardBox) expect(existingCardBox.width, `existing account @ ${theme}: narrower than new-account card`).toBeLessThan(newCardBox.width);
      }
      await expect(page.getByText('Aceptar invitación')).toBeVisible();
      await expectGoldCta(page, page.getByRole('button', { name: 'Añadir acceso y aceptar' }), `existing account @ ${theme}`);
      await expectNoScroll(page, `existing account @ ${theme}`);

      // --- estado terminal: invitación no disponible (token bien formado pero inexistente) ---
      const bogusToken = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
      await page.goto('/login');
      await page.goto(`/accept-invitation#token=${encodeURIComponent(bogusToken)}`);
      if (theme === 'light') await setTheme(page, 'light');
      await expect(page.getByText('Esta invitación ya no está disponible')).toBeVisible();
      await expect(page.getByText('El enlace puede haber caducado, haberse utilizado anteriormente o haber sido cancelado.')).toBeVisible();
      await expect(page.getByText('Aceptar invitación', { exact: true })).toHaveCount(0);
      const unavailableBox = await page.locator('.invite-card--terminal').boundingBox();
      expect(unavailableBox, `unavailable @ ${theme}: card present`).not.toBeNull();
      if (unavailableBox) expect(unavailableBox.width, `unavailable @ ${theme}: max-width <= 600px`).toBeLessThanOrEqual(601);
      const unavailableCta = page.getByRole('button', { name: 'Volver a ShiftImport' });
      await expectGoldCta(page, unavailableCta, `unavailable @ ${theme}`);
      const unavailableGap = await page.evaluate(() => {
        const text = document.querySelector('.invite-terminal-text');
        const cta = document.querySelector('.invite-terminal-cta');
        if (!text || !cta) return null;
        const textBox = text.getBoundingClientRect();
        const ctaBox = cta.getBoundingClientRect();
        return ctaBox.top - textBox.bottom;
      });
      expect(unavailableGap, `unavailable @ ${theme}: gap between text and CTA >= 20px`).toBeGreaterThanOrEqual(20);
      await expectNoScroll(page, `unavailable @ ${theme}`);

      // --- estado terminal: éxito (completa un accept real y sintético) ---
      await page.goto('/login');
      await page.goto(`/accept-invitation#token=${encodeURIComponent(tokens.visualToken)}`);
      if (theme === 'light') await setTheme(page, 'light');
      await page.locator('#invitation-password').fill('E2e-visual-only-1234');
      await page.locator('#invitation-passwordConfirmation').fill('E2e-visual-only-1234');
      await page.getByRole('button', { name: 'Crear cuenta y aceptar' }).click();
      await expect(page.getByText('Acceso activado')).toBeVisible();
      await expect(page.getByText('Ya puedes entrar en Anclora ShiftImport y acceder a tus turnos.')).toBeVisible();
      await expect(page.getByText('Aceptar invitación', { exact: true })).toHaveCount(0);
      const successBox = await page.locator('.invite-card--terminal').boundingBox();
      expect(successBox, `success @ ${theme}: card present`).not.toBeNull();
      if (successBox) expect(successBox.width, `success @ ${theme}: max-width <= 600px`).toBeLessThanOrEqual(601);
      const successCta = page.getByRole('button', { name: 'Ir a la aplicación' });
      await expectGoldCta(page, successCta, `success @ ${theme}`);
      const successGap = await page.evaluate(() => {
        const text = document.querySelector('.invite-terminal-text');
        const cta = document.querySelector('.invite-terminal-cta');
        if (!text || !cta) return null;
        const textBox = text.getBoundingClientRect();
        const ctaBox = cta.getBoundingClientRect();
        return ctaBox.top - textBox.bottom;
      });
      expect(successGap, `success @ ${theme}: gap between text and CTA >= 20px`).toBeGreaterThanOrEqual(20);
      await expectNoScroll(page, `success @ ${theme}`);

      void viewport; // documents intent: viewport comes from the project config, not set here.
    });
  }
});
