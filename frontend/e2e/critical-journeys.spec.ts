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

test.describe("map search", () => {
  test("the map page renders tiles and listing pins", async ({ page }) => {
    await page.goto("/map");

    await expect(page.getByRole("heading", { name: "Explore spaces by area" })).toBeVisible();
    await expect(page.getByText(/spaces match these filters/)).toBeVisible();

    const map = page.getByRole("region", { name: /property map/i });
    await expect(map).toBeVisible();
    await expect(map.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
    await expect(page.getByText("The map could not load")).toHaveCount(0);
  });

  test("the search results map view renders pins", async ({ page }) => {
    await page.goto("/properties");
    await page.getByRole("button", { name: "Map", exact: true }).click();

    const map = page.getByRole("region", { name: /property map/i });
    await expect(map).toBeVisible();
    await expect(map.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".maplibregl-marker").first()).toBeVisible();
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

test.describe("signed-in experience", () => {
  test("signed-in accounts see workspace shortcuts instead of visitor prompts", async ({ page }) => {
    await signIn(page, "+254700000002", "Landlord123!");

    await page.goto("/");
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
    await expect(page.locator("footer")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Create a landlord account" })).toHaveCount(0);

    await page.goto("/landlord");
    await expect(page.getByRole("link", { name: "Go to your workspace" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review this plan" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a landlord account" })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
  });

  test("guests still see the public footer and landlord sign-up prompt", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/Signed in as/)).toHaveCount(0);
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a landlord account" }).first()).toBeVisible();
  });
});

test.describe("property location pinning", () => {
  test("a landlord can pin the exact property location with the device GPS", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: -1.246612, longitude: 34.618123, accuracy: 8 });

    await signIn(page, "+254700000002", "Landlord123!");
    await page.goto("/dashboard/properties/new");
    await expect(page.getByRole("heading", { name: "Add a property" })).toBeVisible();

    await page.getByRole("button", { name: "Use my exact current location" }).click();

    await expect(page.getByText("Location pinned")).toBeVisible();
    await expect(page.getByText("-1.246612, 34.618123")).toBeVisible();
    await expect(page.getByText(/Phone accuracy: about 8 m/)).toBeVisible();
  });
});

test.describe("subscription", () => {
  test("a landlord can see their current plan and listing usage", async ({ page }) => {
    await signIn(page, "+254700000002", "Landlord123!");

    await page.goto("/dashboard/subscription");
    await expect(page.getByRole("heading", { name: "Plan and listing limit" })).toBeVisible();
    await expect(page.getByText("Listing usage")).toBeVisible();
    await expect(page.getByText(/active listings used/)).toBeVisible();
    await expect(page.getByText("Current plan").first()).toBeVisible();
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
