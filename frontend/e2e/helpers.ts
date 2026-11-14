import { expect, type Page } from "@playwright/test";

/**
 * Sign in through the real login form. Tests must use seeded demo accounts and
 * must never bypass authentication by writing cookies directly.
 */
export async function signIn(page: Page, phone: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill(password);

  // Wait for the login response before navigating anywhere else. The session
  // cookie arrives with this response; an immediate page.goto can abort the
  // in-flight request and lose the Set-Cookie header.
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const response = await loginResponse;
  expect(response.ok(), `Login failed with HTTP ${response.status()}`).toBeTruthy();

  // Wait until the app has left the login page so the session is established
  // in the browser before the test navigates again.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function expectDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard(\/|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
