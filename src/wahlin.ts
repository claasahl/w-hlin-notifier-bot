import puppeteer from "puppeteer";

export interface Apartment {
    name: string;
    link: string;
    screenshot: Buffer | string;
  }
  
export  interface ApartmentLink {
    name: string;
    link: string;
  }


export  async function launchBrowser(executable?: string): Promise<puppeteer.Browser> {
    const options =
      typeof executable === "undefined"
        ? { args: ["--no-sandbox"] }
        : { executablePath: executable, args: ["--no-sandbox"] };
    return puppeteer.launch(options);
  }
  
  export async function fetchApartmentLinks(
    browser: puppeteer.Browser
  ): Promise<ApartmentLink[]> {
    const apartmentLinks: ApartmentLink[] = [];
    const mainPage = await browser.newPage();
    await mainPage.goto("https://wahlinfastigheter.se/lediga-objekt/parkering/", {
      waitUntil: "networkidle2"
    });
    const links = await mainPage.$x("//h3/a[contains(@href, '/lediga-objekt/')]");
    for (const link of links) {
      const titleProp = await link.getProperty("title");
      const name = await titleProp.jsonValue();
      const hrefProp = await link.getProperty("href");
      const url = await hrefProp.jsonValue();
      apartmentLinks.push({ name, link: url });
    }
    await mainPage.close();
    return Promise.resolve(apartmentLinks);
  }
  
  export async function fetchApartment(
    browser: puppeteer.Browser,
    apartment: ApartmentLink
  ): Promise<Apartment> {
    const apartmentPage = await browser.newPage();
    await apartmentPage.goto(apartment.link, { waitUntil: "networkidle2" });
    await apartmentPage.click(".new-cookies-button");
    await apartmentPage.waitFor(500);
    const headers = await apartmentPage.$x("//div[@class='fastighet']/div/h2");
    let name = apartment.name;
    if (headers.length > 0) {
      const property = await headers[0].getProperty("innerText");
      name = await property.jsonValue();
    }
  
    const descriptions = await apartmentPage.$x('//div[@class="fastighet"]');
    const photo =
      descriptions.length > 0 ? await descriptions[0].screenshot() : "";
  
    await apartmentPage.close();
    return Promise.resolve({ name, link: apartment.link, screenshot: photo });
  }