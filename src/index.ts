import TelegramBot from "node-telegram-bot-api";
import { CronJob } from "cron";

import * as wahlin from "./wahlin";
import { Browser } from "puppeteer";

// replace the value below with the Telegram token you receive from @BotFather
const TOKEN = process.env.TOKEN || "";
const PARENTS = (process.env.PARENTS || "").split(",");
const CHAT_ID = process.env.CHAT_ID || "";
const EXECUTABLE = process.env.PUPPETEER_EXECUTABLE;
const objects = new Map<string, wahlin.Apartment>();
const reply_markup: TelegramBot.ReplyKeyboardMarkup = {
  keyboard: [
    [
      { text: "/apartments" },
      { text: "/storage" },
      { text: "/parking" },
      { text: "/clear" }
    ]
  ],
  resize_keyboard: true
};
let browser: Browser | undefined = undefined;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TOKEN, { polling: true });

// Listen for "/apartments", "/clear" messages.
bot.onText(/\/apartments/, async msg =>
  execute(msg, chatId => fetchAndPublishObjects(chatId, "lagenhet"))
);
bot.onText(/\/storage/, async msg =>
  execute(msg, chatId => fetchAndPublishObjects(chatId, "forrad"))
);
bot.onText(/\/parking/, async msg =>
  execute(msg, chatId => fetchAndPublishObjects(chatId, "parkering"))
);
bot.onText(/\/clear/, async msg => execute(msg, clearObjects));

async function execute(
  msg: TelegramBot.Message,
  command: (chatId: number | string) => Promise<void>
): Promise<void> {
  const chatId = msg.chat.id;
  if (isFromParent(msg)) {
    try {
      await command(chatId);
    } catch (error) {
      await bot.sendMessage(chatId, error.message, {
        reply_markup
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

function caption(apartment: wahlin.Apartment): string {
  const name = apartment.name;
  const facts = apartment.facts.map(({ key, value }) => `*${key}:* ${value}`);
  const link = `[View Online](${apartment.link})`;
  return [name, ...facts, link].join("\n");
}

async function sendPreview(
  chatId: number | string,
  newLinks: wahlin.ObjectLink[]
) {
  const newObjects = newLinks.length;
  if (newObjects == 0) {
    return bot.sendMessage(chatId, `Found no new objects.`);
  } else if (newObjects == 1) {
    return bot.sendMessage(chatId, `Found 1 new object.`);
  } else if (newObjects > 1) {
    return bot.sendMessage(chatId, `Found ${newObjects} new objects.`);
  }
}

async function fetchAndPublishObjects(
  chatId: number | string,
  category: wahlin.ObjectCategory
): Promise<void> {
  if (!browser) {
    browser = await wahlin.launchBrowser(EXECUTABLE);
  }
  const links = await wahlin.fetchObjectLinks(browser, category);

  const newLinks = links.filter(link => !objects.has(link.link));
  await sendPreview(chatId, newLinks);
  for (const link of links) {
    if (!objects.has(link.link)) {
      try {
        const apartment = await wahlin.fetchObject(browser, link);
        objects.set(link.link, apartment);
        await bot.sendPhoto(chatId, apartment.screenshot, {
          caption: caption(apartment),
          reply_markup,
          parse_mode: "Markdown"
        } as any);
      } catch (error) {
        await bot
          .sendMessage(chatId, link.link, { reply_markup })
          .catch(() => {});
      }
    }
  }
}

async function clearObjects(chatId: number | string) {
  // clear objects
  const noObjects = objects.size;
  objects.clear();
  bot.sendMessage(chatId, `Cleared ${noObjects} object(s)`, { reply_markup });

  // clear browser
  if (browser) {
    await browser.close();
    browser = undefined;
    bot.sendMessage(chatId, 'Stopped "browser" as well', {
      reply_markup
    });
  }
}

// automatically fetch and publish apartments
new CronJob(
  "0 0-35/5 13 * * 1-5",
  () => fetchAndPublishObjects(CHAT_ID, "lagenhet"),
  undefined,
  true,
  "Europe/Stockholm"
);
new CronJob(
  "0 36 13 * * 1-5",
  () => clearObjects(CHAT_ID),
  undefined,
  true,
  "Europe/Stockholm"
);
