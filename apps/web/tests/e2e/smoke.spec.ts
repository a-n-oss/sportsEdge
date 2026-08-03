import { test, expect } from '@playwright/test';

test.describe('SportsEdge Smoke Tests', () => {
  test('should load the dashboard and show predictions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=SportsEdge Predictions').first()).toBeVisible();

    // Seeded upcoming: Golden State Warriors (home) vs Los Angeles Lakers (away)
    await expect(page.locator('text=GSW').first()).toBeVisible();
    await expect(page.locator('text=LAL').first()).toBeVisible();
    await expect(page.getByText("Tonight's Edge").first()).toBeVisible();
  });

  test('should open a matchup detail from the board', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/games/"]').first().click();
    await expect(page.getByText('Why This Edge').first()).toBeVisible();
    await expect(page.getByText('Home-field advantage').first()).toBeVisible();
  });

  test('should navigate to teams directory and view a team detail', async ({ page }) => {
    await page.goto('/teams');

    await expect(page.locator('text=NBA').first()).toBeVisible();
    await expect(page.locator('text=Boston Celtics').first()).toBeVisible();

    await page.click('text=Boston Celtics');

    await expect(page.locator('h1', { hasText: 'Boston Celtics' })).toBeVisible();
    await expect(page.locator('text=Elo Rating History').first()).toBeVisible();

    await expect(page.locator('text=1480').first()).toBeVisible();
  });

  test('should load power rankings', async ({ page }) => {
    await page.goto('/rankings?league=nba');
    await expect(page.locator('text=Power Rankings').first()).toBeVisible();
    await expect(page.locator('text=GSW').first()).toBeVisible();
    await expect(page.locator('text=1600').first()).toBeVisible();
  });

  test('should load accuracy report', async ({ page }) => {
    await page.goto('/accuracy');
    await expect(page.locator('text=Model Accuracy').first()).toBeVisible();
    await expect(page.locator('text=Brier Score').first()).toBeVisible();
  });

  test('should load methodology about page', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('text=The Elo Rating System').first()).toBeVisible();
    await expect(page.locator('text=Home Field Advantage (HFA)')).toBeVisible();
  });
});
