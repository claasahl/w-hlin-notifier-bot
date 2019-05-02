import TelegramBot from "node-telegram-bot-api";
import puppeteer from "puppeteer";
import {CronJob} from "cron";
import express, {Request, Response} from "express";
import bodyParser from "body-parser";

// replace the value below with the Telegram token you receive from @BotFather
const TOKEN = process.env.TOKEN || "";
const PORT = process.env.PORT;
const PROJECT_DOMAIN = process.env.PROJECT_DOMAIN;
const SUCCESS_STICKER_ID = process.env.SUCCESS_STICKER_ID || "";
const FAILED_STICKER_ID = process.env.FAILED_STICKER_ID || "";
const PARENTS = (process.env.PARENTS || "").split(",");
const CHAT_ID = (process.env.CHAT_ID as number | undefined) || -1;
const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE
const apartments = new Map<string, Apartment>();

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TOKEN);
if(PROJECT_DOMAIN) {
    bot.setWebHook(`https://${PROJECT_DOMAIN}.glitch.me/bot${TOKEN}`);
}


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

async function fetchAndPublishApartments(chatId: number) {
    const fetched = await fetchApartments();
    for (const apartment of fetched) {
        if(apartments && !apartments.has(apartment.link)) {
            apartments.set(apartment.link, apartment)
            await bot.sendPhoto(chatId, apartment.screenshot)
            await bot.sendMessage(chatId, apartment.link)
        }
    }
}

interface Apartment {
    name: string,
    link: string,
    screenshot: Buffer | string
}

async function fetchApartments(): Promise<Apartment[]> {
    const apartments: Apartment[] = []
    const options = typeof EXECUTABLE === "undefined" ? {args: ["--no-sandbox"]} : {executablePath: EXECUTABLE,args: ["--no-sandbox"]}
    const browser = await puppeteer.launch(options);

    // look for links to apartments
    const mainPage = await browser.newPage();
    await mainPage.goto('https://wahlinfastigheter.se/lediga-objekt/parkering/', { waitUntil: "networkidle2" });
    const links = await mainPage.$x("//h3/a[contains(@href, '/lediga-objekt/')]");

    // open each apartment in a new page
    for(const link of links) {
        const property = await link.getProperty("href")
        const url = await property.jsonValue()

        const apartmentPage = await browser.newPage()
        await apartmentPage.goto(url,{waitUntil: "networkidle2"})
        await apartmentPage.click(".new-cookies-button")
        await apartmentPage.waitFor(500);
        const headers = await apartmentPage.$x("//div[@class='fastighet']/div/h2")
        let name = "";
        if(headers.length > 0) {
            const property = await headers[0].getProperty("innerText")
            name = await property.jsonValue()
        }

        const descriptions = await apartmentPage.$x('//div[@class="fastighet"]')
        const photo = descriptions.length > 0 ? await descriptions[0].screenshot() : "";
        apartments.push({ name, link: url, screenshot: photo })
        
        await apartmentPage.close()
    }
    await browser.close();
    return apartments
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








const app = express()

// parse the updates to JSON
app.use(bodyParser.json());

// We are receiving updates at the route below!
app.post(`/bot${TOKEN}`, (req: Request, res: Response) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`Express server is listening on ${PORT}`);
});
