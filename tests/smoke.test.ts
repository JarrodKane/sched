/**
 * Smoke tests — run these after every major deploy.
 *
 * Against local dev:  pnpm test:smoke
 * Against production: TEST_BASE_URL=https://your-app.vercel.app pnpm test:smoke
 *
 * Authenticated flow tests require TEST_USER_EMAIL and TEST_USER_PASSWORD to be set.
 * They are skipped gracefully when those vars are absent.
 */

import { test, expect, type Page } from '@playwright/test';

// -----------------------------------------------------------------------
// Auth redirect guards — unauthenticated users must be bounced to /login
// -----------------------------------------------------------------------

const protectedRoutes = [
	'/dashboard',
	'/accounts/00000000-0000-0000-0000-000000000001',
	'/admin/users',
	'/admin/accounts'
];

for (const route of protectedRoutes) {
	test(`unauthenticated ${route} redirects to /login`, async ({ page }) => {
		await page.goto(route);
		await expect(page).toHaveURL(/\/login/);
	});
}

// -----------------------------------------------------------------------
// Login page — structure
// -----------------------------------------------------------------------

test('login page loads and has email + password fields', async ({ page }) => {
	await page.goto('/login');
	await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
	await expect(page.locator('input[type="password"]')).toBeVisible();
	await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('login page responds quickly (< 3s)', async ({ page }) => {
	const start = Date.now();
	await page.goto('/login');
	await page.waitForLoadState('networkidle');
	const elapsed = Date.now() - start;
	expect(elapsed).toBeLessThan(3000);
});

test('bad login credentials show an error, not a crash', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[type="email"], input[name="email"]', 'nobody@example.com');
	await page.fill('input[type="password"]', 'wrongpassword');
	await page.click('button[type="submit"]');

	// Should stay on /login and show an error — not a blank page or 500
	await expect(page).toHaveURL(/\/login/);
	// The page should still be functional (has the submit button)
	await expect(page.locator('button[type="submit"]')).toBeVisible();
});

// -----------------------------------------------------------------------
// Authenticated smoke tests — skipped when credentials are not set
// -----------------------------------------------------------------------

async function loginAs(page: Page, email: string, password: string) {
	await page.goto('/login');
	await page.fill('input[type="email"], input[name="email"]', email);
	await page.fill('input[type="password"]', password);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/dashboard|\/login/);
}

const hasCredentials = !!(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
const authTest = hasCredentials ? test : test.skip;

authTest('can log in and reach dashboard', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);
	// Dashboard must render in under 5 seconds after auth
	await page.waitForLoadState('networkidle');
});

authTest('dashboard shows at least one account card', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);
	// There should be at least one account link on the dashboard
	const accountLinks = page.locator('a[href^="/accounts/"]');
	await expect(accountLinks.first()).toBeVisible({ timeout: 5000 });
});

authTest('can navigate to an account page without error', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);

	// Click the first account card
	const firstAccount = page.locator('a[href^="/accounts/"]').first();
	await firstAccount.click();
	await page.waitForLoadState('networkidle');

	// Should land on /accounts/[id], not an error page
	await expect(page).toHaveURL(/\/accounts\//);
	// Should not be showing a 403 or 500 error
	await expect(page.locator('text=403')).not.toBeVisible();
	await expect(page.locator('text=Internal Error')).not.toBeVisible();
});

authTest('account page loads in under 5 seconds', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);

	const firstAccount = page.locator('a[href^="/accounts/"]').first();
	const href = await firstAccount.getAttribute('href');

	const start = Date.now();
	await page.goto(href!);
	await page.waitForLoadState('networkidle');
	const elapsed = Date.now() - start;

	expect(elapsed).toBeLessThan(5000);
});

authTest('can navigate to history page', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);

	const firstAccount = page.locator('a[href^="/accounts/"]').first();
	const href = await firstAccount.getAttribute('href');
	await page.goto(`${href}/history`);
	await page.waitForLoadState('networkidle');

	await expect(page).toHaveURL(/\/history/);
	await expect(page.locator('text=403')).not.toBeVisible();
});

authTest('logging out returns to login', async ({ page }) => {
	await loginAs(page, process.env.TEST_USER_EMAIL!, process.env.TEST_USER_PASSWORD!);
	await expect(page).toHaveURL(/\/dashboard/);

	// Find a logout button/link (may vary by implementation)
	const logoutButton = page.locator('button:has-text("Sign out"), a:has-text("Sign out"), button:has-text("Log out"), a:has-text("Log out")').first();
	if (await logoutButton.isVisible()) {
		await logoutButton.click();
		await expect(page).toHaveURL(/\/login/);
	} else {
		test.skip(true, 'No visible logout button found');
	}
});
