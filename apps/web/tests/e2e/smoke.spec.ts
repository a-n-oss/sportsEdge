import { test, expect } from '@playwright/test';

test.describe('SportsEdge Smoke Tests', () => {
  test('should load the dashboard and show predictions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('SportsEdge Predictions').first()).toBeVisible();

    // Seeded upcoming: Golden State Warriors (home) vs Los Angeles Lakers (away)
    await expect(page.getByText("Tonight's Edge").first()).toBeVisible();
    await expect(page.getByText('GSW', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('LAL', { exact: true }).first()).toBeVisible();
  });

  test('should open a matchup detail from the board', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href^="/games/"]').first().click();
    await expect(page.getByText('Why This Edge').first()).toBeVisible();
    await expect(page.getByText('Home-field advantage').first()).toBeVisible();
    await expect(page.getByText('STATUS_SCHEDULED')).toHaveCount(0);
    await expect(page.getByText('Crunching the numbers…')).toHaveCount(0);
    await expect(page.getByText('0 – 0')).toHaveCount(0);
  });

  test('should navigate to teams directory and view a team detail', async ({ page }) => {
    // League query avoids matching the nav "NBA" chip while the directory is empty.
    await page.goto('/teams?league=nba');

    await expect(page.getByRole('link', { name: /Boston Celtics/ }).first()).toBeVisible();

    await page.getByRole('link', { name: /Boston Celtics/ }).first().click();

    await expect(page.getByRole('heading', { name: 'Boston Celtics' })).toBeVisible();
    await expect(page.getByText('Elo Rating History').first()).toBeVisible();

    await expect(page.getByText('1480').first()).toBeVisible();
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
    // Empty or populated: page always explains sample sizing / Brier when data exists
    await expect(
      page.getByText(/Brier Score|No accuracy metrics available yet/).first()
    ).toBeVisible();
  });

  test('should load prediction history', async ({ page }) => {
    await page.goto('/history');
    await expect(page.locator('text=Prediction History').first()).toBeVisible();
    await expect(page.getByText(/Closeness/i).first()).toBeVisible();
  });

  test('history final opens the same score and Final status on detail', async ({ page }) => {
    await page.goto('/history');
    await page.locator('a[href="/games/101"]').click();
    await expect(page.getByText('Final').first()).toBeVisible();
    await expect(page.getByText('105 – 110')).toBeVisible();
    await expect(page.getByText('STATUS_FINAL')).toHaveCount(0);
    await expect(page.getByText('Predictions pending…')).toHaveCount(0);
    await expect(page.getByText('Crunching the numbers…')).toHaveCount(0);
  });

  test('should load methodology about page', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('text=The Elo Rating System').first()).toBeVisible();
    await expect(page.locator('text=Home Field Advantage (HFA)')).toBeVisible();
  });
});
