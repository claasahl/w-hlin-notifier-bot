import TelegramBot from "node-telegram-bot-api";
import { CronJob } from "cron";
import express from "express";
import bodyParser from "body-parser";

import * as wahlin from "./wahlin";

// replace the value below with the Telegram token you receive from @BotFather
const TOKEN = process.env.TOKEN || "";
const PORT = Number(process.env.PORT);
const HOST = process.env.HOST;
const SUCCESS_STICKER_ID = process.env.SUCCESS_STICKER_ID || "";
const FAILED_STICKER_ID = process.env.FAILED_STICKER_ID || "";
const PARENTS = (process.env.PARENTS || "").split(",");
const CHAT_ID = (process.env.CHAT_ID as number | undefined) || -1;
const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE;
const apartments = new Map<string, wahlin.Apartment>();

// Create a bot that uses 'polling' to fetch new updates
const polling = typeof HOST === "undefined" || typeof PORT === "undefined";
const bot = new TelegramBot(TOKEN, { polling, webHook: !polling });

// Listen for "/apartments", "/clear" messages.
bot.onText(/\/apartments/, async msg =>
  execute(msg, fetchAndPublishApartments)
);
bot.onText(/\/clear/, async msg => execute(msg, clearApartments));

async function execute(
  msg: TelegramBot.Message,
  command: (chatId: number) => Promise<void>
): Promise<void> {
  const chatId = msg.chat.id;
  if (isFromParent(msg)) {
    try {
      await command(chatId);
      const markupApartments: TelegramBot.ReplyKeyboardMarkup = {
        keyboard: [[{ text: "/apartments" }, { text: "/clear" }]],
        resize_keyboard: true
      };
      await bot.sendSticker(chatId, SUCCESS_STICKER_ID, {
        reply_markup: markupApartments
      });
    } catch (error) {
      console.log(error);
      await bot.sendSticker(chatId, FAILED_STICKER_ID);
    }
  } else {
    await bot.sendMessage(chatId, "I shall obay mee masters, only!", {
      reply_to_message_id: msg.message_id
    });
  }
}

function isFromParent(msg: TelegramBot.Message): boolean {
  if (msg.from) {
    return PARENTS.indexOf("" + msg.from.id) >= 0;
  }
  return false;
}

async function fetchAndPublishApartments(chatId: number): Promise<void> {
  const browser = await wahlin.launchBrowser(EXECUTABLE);
  const links = await wahlin.fetchApartmentLinks(browser);
  await bot.sendMessage(
    chatId,
    `Found ${links.length} apartment(s). Will send more details in a moments.`
  );
  for (const link of links) {
    try {
      const apartment = await wahlin.fetchApartment(browser, link);
      await bot.sendPhoto(chatId, apartment.screenshot, {
        caption: apartment.link
      });
    } catch (error) {
      await bot.sendMessage(chatId, link.link).catch(() => {});
    }
  }
  return browser.close();
}

async function clearApartments() {
  apartments.clear();
}

// automatically fetch and publish apartments
new CronJob("00 0-35/5 13 * * 1-5", () =>
  fetchAndPublishApartments(CHAT_ID)
).start();
new CronJob("00 36 13 * * 1-5", clearApartments).start();

// enable webHooks, if needed
if (!polling) {
  bot.setWebHook(`${HOST}/bot${TOKEN}`);

  const app = express();
  app.use(bodyParser.json());
  app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
  app.listen(PORT, () => {
    console.log(`Server is listening on ${PORT}`);
  });
}
