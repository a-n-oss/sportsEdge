import { test, expect } from '@playwright/test';

test.describe('SportsEdge Smoke Tests', () => {
  test('should load the dashboard and show predictions', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=SportsEdge Predictions').first()).toBeVisible();
    
    // Check if the seeded game shows up. The seeded game is between Golden State Warriors and Los Angeles Lakers
    await expect(page.locator('text=Golden State Warriors').first()).toBeVisible();
    await expect(page.locator('text=Los Angeles Lakers').first()).toBeVisible();
  });

  test('should navigate to teams directory and view a team detail', async ({ page }) => {
    await page.goto('/teams');
    
    await expect(page.locator('text=NBA')).toBeVisible();
    await expect(page.locator('text=Boston Celtics')).toBeVisible();
    
    // Click on Boston Celtics
    await page.click('text=Boston Celtics');
    
    // Check Team details view
    await expect(page.locator('h1', { hasText: 'Boston Celtics' })).toBeVisible();
    await expect(page.locator('text=Rating History')).toBeVisible();
    
    // The history should have the 1480 elo rating seeded
    await expect(page.locator('text=1480').first()).toBeVisible();
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
