import { shortest } from "@antiwork/shortest";

const PGXN_HOME = "https://pgxn.org/";
const PGXN_USERS = "https://pgxn.org/users/";

type PgxnUserProfile = {
  nickname: string;
  email: string;
  url: string;
};

async function searchPgVector(page: any) {
  await page.goto(PGXN_HOME);
  await page.waitForLoadState("domcontentloaded");

  const searchInput = page
    .locator('input[name="q"], input[type="search"], input[type="text"]')
    .first();

  await searchInput.fill("pg_vector");
  await searchInput.press("Enter");
  await page.waitForLoadState("domcontentloaded");
}

async function openPenultimateSUser(page: any) {
  await page.getByRole("link", { name: "Users" }).click();
  await page.waitForURL(/\/users\/?$/);

  await page.getByRole("link", { name: "s", exact: true }).click();
  await page.waitForURL(/\/users\/\?c=s/);

  const sUsers = page.locator('h2 a[href^="/user/"]');
  const userCount = await sUsers.count();

  if (userCount < 2) {
    throw new Error("Expected at least two PGXN users starting with s");
  }

  const penultimateUser = sUsers.nth(userCount - 2);
  await penultimateUser.scrollIntoViewIfNeeded();
  await penultimateUser.click();
  await page.waitForLoadState("domcontentloaded");
}

async function extractProfileFields(page: any): Promise<PgxnUserProfile> {
  return await page.evaluate(() => {
    const lines = document.body.innerText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const valueAfter = (label: string) => {
      const labelIndex = lines.findIndex((line) => line === label);
      if (labelIndex === -1 || !lines[labelIndex + 1]) {
        throw new Error(`Could not find PGXN user field: ${label}`);
      }
      return lines[labelIndex + 1];
    };

    const urlText = valueAfter("URL");
    const urlLink = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="http"]'),
    ).find(
      (link) =>
        link.textContent?.trim() === urlText || link.href.includes(urlText),
    );

    return {
      nickname: valueAfter("Nickname"),
      email: valueAfter("Email"),
      url: urlLink?.href || urlText,
    };
  });
}

shortest.beforeEach(async ({ page }) => {
  await page.goto(PGXN_HOME);
});

shortest(
  "Search PGXN for pg_vector and verify the vector distribution can be opened from the search results",
  {
    query: "pg_vector",
    expectedDistribution: "vector",
    expectedDescription: "Open-source vector similarity search for Postgres",
  },
)
  .expect("Type pg_vector in the PGXN search input and submit the search")
  .expect("Open the vector distribution result")
  .expect("Confirm the page describes pgvector/vector similarity search");

shortest(
  "Use the PGXN navigation to open Users, choose the letter s, scroll to the bottom of the s users page, open the penultimate user, and read Nickname, Email, and URL",
  {
    startUrl: PGXN_HOME,
    usersUrl: PGXN_USERS,
    letter: "s",
    fieldsToCollect: ["Nickname", "Email", "URL"],
  },
)
  .expect("Click the Users link in the top-right navigation")
  .expect("Click the letter s in the user letter index")
  .expect("Scroll to the bottom and click the penultimate user in the s list")
  .expect("Collect the Nickname, Email, and URL values from the user profile");

shortest(
  "Deterministically collect the penultimate PGXN user under s",
  async ({ page }) => {
    await searchPgVector(page);
    const searchResultsText = await page.locator("body").innerText();
    expect(searchResultsText).toMatch(/vector|pgvector/i);

    await openPenultimateSUser(page);
    const profile = await extractProfileFields(page);

    console.log("PGXN penultimate s user profile", profile);

    expect(profile.nickname).toBeTruthy();
    expect(profile.email).toMatch(/@/);
    expect(profile.url).toMatch(/^https?:\/\//);
  },
);

shortest(
  "Validate the current PGXN penultimate s user profile details",
  async ({ page }) => {
    await page.goto("https://pgxn.org/users/?c=s");
    await openPenultimateSUser(page);

    const profile = await extractProfileFields(page);

    expect(profile).toEqual({
      nickname: "suissai",
      email: "suissaidev@gmail.com",
      url: "https://suissai.dev",
    });
  },
);
