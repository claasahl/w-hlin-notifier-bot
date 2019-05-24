import puppeteer from "puppeteer";

interface Fact {
  key: string;
  value: string;
}

export interface Apartment {
  name: string;
  link: string;
  screenshot: Buffer | string;
  facts: Fact[];
}

export interface ObjectLink {
  name: string;
  link: string;
}

export type ObjectCategory = "lagenhet" | "forrad" | "parkering" | "lokaler";

export async function launchBrowser(
  executable?: string
): Promise<puppeteer.Browser> {
  const options =
    typeof executable === "undefined"
      ? { args: ["--no-sandbox"] }
      : { executablePath: executable, args: ["--no-sandbox"] };
  return puppeteer.launch(options);
}

export async function fetchObjectLinks(
  browser: puppeteer.Browser,
  category: ObjectCategory
): Promise<ObjectLink[]> {
  const apartmentLinks: ObjectLink[] = [];
  const page = await browser.newPage();
  await page.goto(`https://wahlinfastigheter.se/lediga-objekt/${category}/`, {
    waitUntil: "networkidle2"
  });
  await page.click(".new-cookies-button");
  await page.waitFor(500);
  const links = await page.$x("//h3/a[contains(@href, '/lediga-objekt/')]");
  for (const link of links) {
    const titleProp = await link.getProperty("title");
    const name = await titleProp.jsonValue();
    const hrefProp = await link.getProperty("href");
    const url = await hrefProp.jsonValue();
    apartmentLinks.push({ name, link: url });
  }
  await page.close();
  return Promise.resolve(apartmentLinks);
}

export async function fetchObject(
  browser: puppeteer.Browser,
  apartment: ObjectLink
): Promise<Apartment> {
  const page = await browser.newPage();
  await page.goto(apartment.link, { waitUntil: "networkidle2" });
  const headers = await page.$x("//div[@class='fastighet']/div/h2");
  let name = apartment.name;
  if (headers.length > 0) {
    const property = await headers[0].getProperty("innerText");
    name = await property.jsonValue();
  }

  const descriptions = await page.$x('//div[@class="fastighet"]');
  const photo =
    descriptions.length > 0 ? await descriptions[0].screenshot() : "";

  const facts: Fact[] = [];
  const keys = await page.$x('//li[@class="left"]');
  const values = await page.$x('//li[@class="right"]');
  for (var i = 0; i < Math.min(keys.length, values.length); i++) {
    const key = String(
      await (await keys[i].getProperty("textContent")).jsonValue()
    ).trim();
    const value = String(
      await (await values[i].getProperty("textContent")).jsonValue()
    ).trim();
    facts.push({ key, value });
  }

  await page.close();
  return Promise.resolve({
    name,
    link: apartment.link,
    screenshot: photo,
    facts
  });
}
