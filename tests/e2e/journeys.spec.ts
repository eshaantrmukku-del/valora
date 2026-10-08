import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';

async function signUp(page: Page, name = 'Alex') {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('First name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding');
  return email;
}

async function interpretAndSearch(page: Page, goal: string) {
  await page.goto('/discover');
  await page.locator('#discover-query').fill(goal);
  await page.getByRole('button', { name: 'Interpret goal' }).click();
  await expect(page.getByText('Hard requirements (enforced)')).toBeVisible();
  await page.getByRole('button', { name: /Save brief & search/ }).click();
  await expect(page.locator('.disc-card').first()).toBeVisible({ timeout: 30_000 });
}

test('Journey A — first use: onboarding, brief persists and reopens', async ({ page }) => {
  await signUp(page);
  await page.getByLabel('Preferred locations').fill('Testville');
  await page.getByLabel('Budget up to (£)').fill('450000');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByText('Analyses').first()).toBeVisible();

  await page.goto('/discover');
  await page
    .locator('#discover-query')
    .fill('3 bed house in Testville under £400k that needs modernising with a large garden');
  await page.getByRole('button', { name: 'Interpret goal' }).click();
  await page.getByLabel('Brief name').fill('My Testville brief');
  await page.getByRole('button', { name: 'Save only' }).click();
  await expect(page.locator('.disc-brief-item-name', { hasText: 'My Testville brief' })).toBeVisible();

  await page.reload();
  await page
    .locator('.disc-brief-item', { hasText: 'My Testville brief' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await expect(page.getByLabel('Max price (£)')).toHaveValue('400000');
  await expect(page.getByLabel('Min bedrooms')).toHaveValue('3');
  await expect(page.getByRole('button', { name: /Needs modernising/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Journey B — Discover: interpret, correct, search fixtures, save and reopen', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.goto('/discover');
  await page.locator('#discover-query').fill('3 bed house in Testville under £500k that needs modernising');
  await page.getByRole('button', { name: 'Interpret goal' }).click();
  // correct a mistake: tighten the budget
  await page.getByLabel('Max price (£)').fill('300000');
  await page.getByRole('button', { name: /Save brief & search/ }).click();
  await expect(page.locator('.disc-card').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('.status-pill', { hasText: /Test fixtures \(not real listings\)/i }),
  ).toBeVisible();
  const prices = await page.locator('.disc-card-price').allInnerTexts();
  for (const p of prices) expect(Number(p.replace(/[^0-9]/g, ''))).toBeLessThanOrEqual(300000);

  await page.locator('.disc-card').first().getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.disc-card').first().getByRole('button', { name: 'Saved ✓' })).toBeVisible();
  await page.goto('/portfolio');
  await expect(page.locator('.app-card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.app-card').first()).toBeVisible();
});

test('Journey C — strategy-aware analysis keeps facts and changes emphasis', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await interpretAndSearch(
    page,
    '3 bed house in Testville under £500k that needs modernising with extension potential',
  );
  await page.locator('.disc-card').first().getByRole('button', { name: 'View analysis' }).click();
  await page.waitForURL('**/analyse/*');
  await expect(page.locator('.score-breakdown')).toContainText('Improvement opportunity');
  const price = await page.locator('.pqf').first().innerText();

  // second brief: rental
  await page.goto('/discover');
  await page
    .locator('#discover-query')
    .fill('3 bed house in Testville under £500k for long-term rental with positive cash flow');
  await page.getByRole('button', { name: 'Interpret goal' }).click();
  await page.getByRole('button', { name: 'Save only' }).click();
  await expect(page.locator('.disc-brief-item')).toHaveCount(2);

  await page.goBack();
  await page.goto('/analyse');
  await page.locator('.app-card').first().click();
  await page.waitForURL('**/analyse/*');
  const select = page.getByLabel('Brief to analyse with');
  const rentalOption = await select
    .locator('option', { hasText: /rental/i })
    .first()
    .getAttribute('value');
  await select.selectOption(rentalOption!);
  await page.getByRole('button', { name: 'Analyse with this strategy' }).click();
  await expect(page.locator('.score-breakdown')).toContainText('Monthly cash flow', { timeout: 20_000 });
  expect(await page.locator('.pqf').first().innerText()).toBe(price);

  // edit an assumption and recalculate deterministically
  await page.getByLabel('Monthly rent', { exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('Recalculated')).toBeVisible();
  await expect(page.locator('#as-monthlyRent')).toHaveValue('2000');
});

test('Journey D — failure handling is explicit', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  // unresolvable location
  await page.goto('/discover');
  await page.locator('#discover-query').fill('3 bed house in Atlantis under £500k');
  await page.getByRole('button', { name: 'Interpret goal' }).click();
  await page.getByRole('button', { name: /Save brief & search/ }).click();
  await expect(page.getByText(/could be resolved/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.disc-card')).toHaveCount(0);

  // portal URL is explained, not scraped
  await page.goto('/analyse');
  await page.locator('#analyse-url').fill('https://www.rightmove.co.uk/properties/123');
  await page.getByRole('button', { name: 'Analyse', exact: true }).click();
  await expect(page.getByText('Listing link not supported')).toBeVisible();

  // AI assistant not configured
  await page.goto('/assistant');
  await expect(page.getByText(/needs an AI provider/).first()).toBeVisible();
});

test('Journey E — another user cannot open my analysis', async ({ page, browser }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await interpretAndSearch(page, '3 bed house in Testville under £500k');
  await page.locator('.disc-card').first().getByRole('button', { name: 'View analysis' }).click();
  await page.waitForURL('**/analyse/*');
  const url = page.url();

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUp(p2, 'Bob');
  await p2.getByRole('button', { name: 'Skip for now' }).click();
  await p2.goto(url);
  await expect(p2.getByRole('heading', { name: 'Analysis not found' })).toBeVisible();
  await other.close();
});

test('Journey F — financial tools match independently worked examples', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Stamp duty' }).click();
  await page.locator('.tool-field', { hasText: 'Purchase price' }).locator('input').fill('300000');
  await expect(page.locator('.tool-result-value').first()).toHaveText('£20,000');
  await page.locator('.tool-field', { hasText: 'UK nation' }).locator('select').selectOption('scotland');
  await expect(page.locator('.tool-result-value').first()).toHaveText('£28,600');
  await page.locator('.tool-field', { hasText: 'UK nation' }).locator('select').selectOption('wales');
  await expect(page.locator('.tool-result-value').first()).toHaveText('£19,950');
});
