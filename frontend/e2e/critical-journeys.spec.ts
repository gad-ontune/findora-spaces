import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.describe("public discovery", () => {
  test("a visitor can move from the home page to a real listing and its Property Passport", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/find a space/i);

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Browse spaces" })
      .click();

    await expect(page).toHaveURL(/\/properties/);
    await expect(page.getByRole("heading", { name: "Spaces for rent" })).toBeVisible();

    const firstListing = page.locator('a[href^="/properties/"]').first();
    await expect(firstListing).toBeVisible();
    const href = await firstListing.getAttribute("href");
    expect(href).toMatch(/^\/properties\/[0-9a-f-]{36}$/);

    await firstListing.click();
    await expect(page).toHaveURL(new RegExp(href as string));
    await expect(page.getByText("Property Passport").first()).toBeVisible();
    await expect(page.getByText(/availability/i).first()).toBeVisible();
  });

  test("public search never asks a visitor to sign in before browsing", async ({ page }) => {
    await page.goto("/properties");
    await expect(page.getByRole("heading", { name: "Spaces for rent" })).toBeVisible();
    await expect(page.getByLabel("Search words")).toBeVisible();
    await expect(page.getByLabel("County")).toBeVisible();
  });
});

test.describe("authentication and role landing", () => {
  test("a seeker signs in and lands on their dashboard", async ({ page }) => {
    await signIn(page, "+254700000005", "Seeker123!");

    await expect(page).toHaveURL(/\/dashboard(\/|$)/);
    await expect(page.getByRole("heading", { name: /Karibu/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Find it for me/i }).first()).toBeVisible();
  });

  test("a landlord lands on their listing workspace", async ({ page }) => {
    await signIn(page, "+254700000002", "Landlord123!");

    await expect(page).toHaveURL(/\/dashboard\/properties/);
    await expect(page.getByRole("heading", { name: "Your listings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a property" }).first()).toBeVisible();
  });
});

test.describe("assisted search", () => {
  test("a signed-in seeker can submit a genuine assisted search request", async ({ page }) => {
    await signIn(page, "+254700000005", "Seeker123!");

    await page.goto("/assisted");
    await expect(page.getByRole("heading", { name: "Find it for me" })).toBeVisible();

    await page.getByLabel("County").selectOption({ label: "Migori" });
    await page.getByLabel("Town or city").selectOption({ label: "Kehancha (Migori)" });
    await page.getByLabel("Maximum budget (KES)").fill("15000");
    await page
      .getByLabel("What should we know?")
      .fill("Playwright journey: quiet compound, secure water, close to Kehancha market.");
    await page.getByLabel(/I consent to Findora reviewing my request/i).check();

    await page.getByRole("button", { name: "Submit assisted search request" }).click();

    await expect(page.getByRole("heading", { name: "Your request is with our team" })).toBeVisible();
    await expect(page.getByText(/^ASR-/)).toBeVisible();
  });
});

test.describe("admin access control", () => {
  test("staff sign in to the admin console and can open the moderation queue", async ({ page }) => {
    await signIn(page, "+254700000001", "Admin123!");

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();

    const adminNav = page.getByRole("navigation", { name: "Admin navigation" }).first();
    await adminNav.getByRole("link", { name: "Moderation queue" }).click();
    await expect(page.getByRole("heading", { name: "Moderation queue" })).toBeVisible();
  });

  test("a seeker cannot use the admin console even when navigating directly", async ({ page }) => {
    await signIn(page, "+254700000005", "Seeker123!");

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Staff access required" })).toBeVisible();
  });
});
