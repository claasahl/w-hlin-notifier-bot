import TelegramBot from "node-telegram-bot-api";
import { CronJob } from "cron";

import * as wahlin from "./wahlin";
import { Browser } from "puppeteer";

// replace the value below with the Telegram token you receive from @BotFather
const TOKEN = process.env.TOKEN || "";
const PARENTS = (process.env.PARENTS || "").split(",");
const CHAT_ID = (process.env.CHAT_ID as number | undefined) || -1;
const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE;
const apartments = new Map<string, wahlin.Apartment>();
const markupApartments: TelegramBot.ReplyKeyboardMarkup = {
  keyboard: [[{ text: "/apartments" }, { text: "/clear" }]],
  resize_keyboard: true
};

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TOKEN, { polling: true });

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
    } catch (error) {
      await bot.sendMessage(chatId, error.message, {
        reply_markup: markupApartments
      });
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

async function sendPreview(chatId: number, newLinks: wahlin.ApartmentLink[]) {
  const newApartments = newLinks.length;
  if (newApartments == 0) {
    return bot.sendMessage(chatId, `Found no new apartments.`);
  } else if (newApartments == 1) {
    return bot.sendMessage(chatId, `Found one new apartment.`);
  } else if (newApartments > 1) {
    return bot.sendMessage(chatId, `Found ${newApartments} new apartments.`);
  }
}

async function fetchAndPublishApartments(chatId: number): Promise<void> {
  const browser = await wahlin.launchBrowser(EXECUTABLE);
  const links = await wahlin.fetchApartmentLinks(browser);

  const newLinks = links.filter(link => !apartments.has(link.link));
  await sendPreview(chatId, newLinks);
  for (const link of links) {
    if (!apartments.has(link.link)) {
      try {
        const apartment = await wahlin.fetchApartment(browser, link);
        apartments.set(link.link, apartment);
        await bot.sendPhoto(chatId, apartment.screenshot, {
          caption: apartment.link,
          reply_markup: markupApartments
        });
      } catch (error) {
        await bot
          .sendMessage(chatId, link.link, { reply_markup: markupApartments })
          .catch(() => {});
      }
    }
  }
  return browser.close();
}

async function clearApartments(chatId: number) {
  const noApartments = apartments.size;
  apartments.clear();
  bot.sendMessage(chatId, `Cleared ${noApartments} apartment(s)`, {
    reply_markup: markupApartments
  });
}

// automatically fetch and publish apartments
new CronJob("00 0-35/5 13 * * 1-5", () =>
  fetchAndPublishApartments(CHAT_ID)
).start();
new CronJob("00 36 13 * * 1-5", () => clearApartments(CHAT_ID)).start();
