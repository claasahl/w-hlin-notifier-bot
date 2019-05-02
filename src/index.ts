import TelegramBot from "node-telegram-bot-api";
import puppeteer from "puppeteer";
import {CronJob} from "cron";
import express from "express";
import bodyParser from "body-parser";

// replace the value below with the Telegram token you receive from @BotFather
const TOKEN = process.env.TOKEN || "";
const PORT = Number(process.env.PORT);
const HOST = process.env.HOST;
const SUCCESS_STICKER_ID = process.env.SUCCESS_STICKER_ID || "";
const FAILED_STICKER_ID = process.env.FAILED_STICKER_ID || "";
const PARENTS = (process.env.PARENTS || "").split(",");
const CHAT_ID = (process.env.CHAT_ID as number | undefined) || -1;
const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE
const apartments = new Map<string, Apartment>();

// Create a bot that uses 'polling' to fetch new updates
const polling = typeof HOST === "undefined" || typeof PORT === "undefined";
const bot = new TelegramBot(TOKEN, {polling, webHook: !polling});

// Listen for "/apartments" messages.
bot.onText(/\/apartments/, async (msg) => {
    const chatId = msg.chat.id;
    if (isFromParent(msg)) {
        try {
            await fetchAndPublishApartments(chatId)
            const markupApartments: TelegramBot.ReplyKeyboardMarkup = {
                keyboard: [[{ text: "/apartments" }]],
                resize_keyboard: true
            }
            await bot.sendSticker(chatId, SUCCESS_STICKER_ID, { reply_markup: markupApartments })
        } catch(error) {
            console.log(error)
            await bot.sendSticker(chatId, FAILED_STICKER_ID)
        }
    }
})

function isFromParent(msg: TelegramBot.Message): boolean {
    if (msg.from) {
        return PARENTS.indexOf("" + msg.from.id) >= 0;
    }
    return false;
}


interface Apartment {
    name: string,
    link: string,
    screenshot: Buffer | string
}

interface ApartmentLink {
    name: string,
    link: string
}

async function launchBrowser(): Promise<puppeteer.Browser> {
    const options = typeof EXECUTABLE === "undefined" ? {args: ["--no-sandbox"]} : {executablePath: EXECUTABLE,args: ["--no-sandbox"]}
    return puppeteer.launch(options);
}

async function fetchApartmentLinks(browser: puppeteer.Browser): Promise<ApartmentLink[]> {
    const apartmentLinks:ApartmentLink[] = []
    const mainPage = await browser.newPage();
    await mainPage.goto('https://wahlinfastigheter.se/lediga-objekt/parkering/', { waitUntil: "networkidle2" });
    const links = await mainPage.$x("//h3/a[contains(@href, '/lediga-objekt/')]");
    for(const link of links) {
        const titleProp = await link.getProperty("title")
        const name = await titleProp.jsonValue();
        const hrefProp = await link.getProperty("href")
        const url = await hrefProp.jsonValue();
        apartmentLinks.push({name, link: url})
    }
    await mainPage.close();
    return Promise.resolve(apartmentLinks);
}

async function fetchApartment(browser: puppeteer.Browser, apartment: ApartmentLink): Promise<Apartment> {
    const apartmentPage = await browser.newPage()
    await apartmentPage.goto(apartment.link,{waitUntil: "networkidle2"})
    await apartmentPage.click(".new-cookies-button")
    await apartmentPage.waitFor(500);
    const headers = await apartmentPage.$x("//div[@class='fastighet']/div/h2")
    let name = apartment.name;
    if(headers.length > 0) {
        const property = await headers[0].getProperty("innerText")
        name = await property.jsonValue()
    }

    const descriptions = await apartmentPage.$x('//div[@class="fastighet"]')
    const photo = descriptions.length > 0 ? await descriptions[0].screenshot() : "";
    
    await apartmentPage.close()
    return Promise.resolve({ name, link: apartment.link, screenshot: photo })
}

async function fetchAndPublishApartments(chatId: number): Promise<void> {
    const browser = await launchBrowser();
    const links = await fetchApartmentLinks(browser);
    for(const link of links) {
        try {
        const apartment = await fetchApartment(browser, link)
        await bot.sendPhoto(chatId, apartment.screenshot, {caption: apartment.link})
        } catch(error) {
            await bot.sendMessage(chatId, link.link).catch(() => {});
        }
    }
}

// automatically fetch and publish apartments
new CronJob('00 0,5,10,15,20,25,30,35 13 * * 1-5', () => fetchAndPublishApartments(CHAT_ID)).start();
new CronJob('00 36 13 * * 1-5', () => apartments.clear()).start()

//
const job = new CronJob('0 */30 * * * *', () => {
    const d = new Date();
    bot.sendMessage(CHAT_ID, d.toISOString())
});
job.start();





if (!polling) {
    bot.setWebHook(`${HOST}/bot${TOKEN}`);

    const app = express()
    app.use(bodyParser.json());
    app.post(`/bot${TOKEN}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
    app.listen(PORT, () => {
        console.log(`Server is listening on ${PORT}`);
    });
}
