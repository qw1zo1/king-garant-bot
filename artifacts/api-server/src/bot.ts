import { Bot, Context, InputFile, Keyboard, InlineKeyboard, session, SessionFlavor } from "grammy";
import { createReadStream } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, balancesTable, dealsTable } from "@workspace/db";
import { logger } from "./lib/logger";

const SUPPORT_USERNAME = "@king_helper";
const ADMIN_CHAT_ID = -1003841813791;
const ASSETS_DIR = path.resolve("src/assets");

function img(name: string): InputFile {
  return new InputFile(createReadStream(path.join(ASSETS_DIR, name)), name);
}

type Currency =
  | "hrn" | "rub" | "ton" | "stars"
  | "usd" | "eur" | "usdt" | "btc" | "eth"
  | "kzt" | "byn" | "gbp" | "cny" | "notcoin" | "sol";

const CURRENCY_LABELS: Record<Currency, string> = {
  hrn: "ГРН", rub: "РУБ", ton: "TON", stars: "Stars",
  usd: "USD", eur: "EUR", usdt: "USDT", btc: "BTC", eth: "ETH",
  kzt: "KZT", byn: "BYN", gbp: "GBP", cny: "CNY", notcoin: "NOT", sol: "SOL",
};

const CURRENCY_ALIASES: Record<string, Currency> = {
  // ГРН
  грн: "hrn", uah: "hrn", гривн: "hrn", гривна: "hrn", гривны: "hrn", гривень: "hrn",
  hryvnia: "hrn", hryvna: "hrn", hrn: "hrn",
  // РУБ
  руб: "rub", rub: "rub", рубль: "rub", рубли: "rub", рублей: "rub",
  рублі: "rub", рублів: "rub", rouble: "rub", ruble: "rub",
  // TON
  тон: "ton", ton: "ton", toncoin: "ton",
  // Stars
  звезды: "stars", stars: "stars", звезда: "stars", звёзды: "stars",
  star: "stars", звёздочки: "stars", звездочки: "stars",
  // USD
  доллар: "usd", доллары: "rub", долларов: "usd", usd: "usd",
  долл: "usd", dollar: "usd", dollars: "usd",
  // EUR
  евро: "eur", eur: "eur", euro: "eur", euros: "eur",
  // USDT
  usdt: "usdt", тезер: "usdt", tether: "usdt", тетер: "usdt",
  // BTC
  btc: "btc", bitcoin: "btc", биткоин: "btc", биткойн: "btc", битки: "btc",
  // ETH
  eth: "eth", ethereum: "eth", эфир: "eth", эфириум: "eth",
  // KZT
  kzt: "kzt", тенге: "kzt", tenge: "kzt",
  // BYN
  byn: "byn", белруб: "byn", белорусский: "byn", bel: "byn",
  // GBP
  gbp: "gbp", фунт: "gbp", pound: "gbp", pounds: "gbp",
  // CNY
  cny: "cny", юань: "cny", yuan: "cny", rmb: "cny",
  // NOT / Notcoin
  not: "notcoin", notcoin: "notcoin", ноткоин: "notcoin",
  // SOL
  sol: "sol", solana: "sol", солана: "sol",
};

interface SessionData {
  step?: "title" | "price";
  dealTitle?: string;
  dealPrice?: number;
}

type MyContext = Context & SessionFlavor<SessionData>;

function normalizeCurrency(raw: string): Currency | null {
  return CURRENCY_ALIASES[raw.toLowerCase().trim()] ?? null;
}

function generateDealId(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function mainMenu() {
  return new Keyboard()
    .text("🤝 Создать сделку").row()
    .text("💼 Кошелёк").text("📊 Статистика").row()
    .text("📖 Инструкция").text("🆘 Поддержка")
    .resized()
    .persistent();
}

function currencyKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🇺🇦 ГРН", "currency_hrn").text("🇷🇺 РУБ", "currency_rub").text("💵 USD", "currency_usd").row()
    .text("💶 EUR", "currency_eur").text("🪙 USDT", "currency_usdt").text("₿ BTC", "currency_btc").row()
    .text("⟠ ETH", "currency_eth").text("💎 TON", "currency_ton").text("⭐ Stars", "currency_stars").row()
    .text("🌊 SOL", "currency_sol").text("🐸 NOT", "currency_notcoin").text("🇰🇿 KZT", "currency_kzt").row()
    .text("🇧🇾 BYN", "currency_byn").text("🇬🇧 GBP", "currency_gbp").text("🇨🇳 CNY", "currency_cny");
}

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function num(value: number | string): string {
  return esc(String(value));
}

function fmtPrice(value: number | string): string {
  const n = parseFloat(String(value));
  return num(n.toString());
}

function isPrivate(ctx: MyContext): boolean {
  return ctx.chat?.type === "private";
}

type BalanceRow = typeof balancesTable.$inferSelect;
type CurrencyDbKey = "hrn" | "rub" | "ton" | "stars" | "usd" | "eur" | "usdt" | "btc" | "eth" | "kzt" | "byn" | "gbp" | "cny" | "notcoin" | "sol";

async function getOrCreateBalance(userId: string): Promise<BalanceRow> {
  const existing = await db.select().from(balancesTable).where(eq(balancesTable.userId, userId)).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(balancesTable).values({ userId }).returning();
  return created;
}

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.error("TELEGRAM_BOT_TOKEN is not set — bot will not start");
    return null;
  }

  const bot = new Bot<MyContext>(token);
  bot.use(session<SessionData, MyContext>({ initial: (): SessionData => ({}) }));

  bot.api.setMyCommands([
    { command: "start",       description: "🏠 Главное меню" },
    { command: "wallet",      description: "💼 Кошелёк и баланс" },
    { command: "stats",       description: "📊 Статистика бота" },
    { command: "instruction", description: "📖 Как создать сделку" },
    { command: "support",     description: "🆘 Поддержка" },
    { command: "help",        description: "❓ Помощь" },
  ]).catch(() => {});

  // /start
  bot.command("start", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    if (userId) await getOrCreateBalance(userId);

    const startParam = ctx.match;
    if (typeof startParam === "string" && startParam.startsWith("deal_")) {
      const dealId = startParam.replace("deal_", "");
      const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.dealId, dealId)).limit(1);

      if (!deal) { await ctx.reply("❌ Сделка не найдена или аннулирована.", { reply_markup: mainMenu() }); return; }
      if (deal.status !== "active") { await ctx.reply("❌ Эта сделка уже завершена или оплачена.", { reply_markup: mainMenu() }); return; }
      if (deal.sellerId === userId) {
        await ctx.reply("⚠️ Вы продавец этой сделки\\. Ожидайте оплаты покупателем\\.", { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
        return;
      }

      await db.update(dealsTable).set({ buyerId: userId }).where(eq(dealsTable.dealId, dealId));

      const kb = new InlineKeyboard()
        .text("💳 Оплатить сделку", `pay_${dealId}`).row()
        .text("❌ Отмена", "menu_main");

      const caption =
        `🤝 *Страница сделки*\n\n` +
        `📦 *Товар:* ${esc(deal.title)}\n` +
        `💵 *Сумма:* ${fmtPrice(deal.price as string)} ${CURRENCY_LABELS[deal.currency as Currency] ?? deal.currency}\n` +
        `🆔 *ID:* \`${dealId}\`\n\n` +
        `Средства списываются с вашего баланса\\. Нажмите кнопку для оплаты\\.`;

      await ctx.replyWithPhoto(img("deal_create.png"), { caption, parse_mode: "MarkdownV2", reply_markup: kb });
      return;
    }

    const caption =
      "🤖 *Добро пожаловать в King Garant Bot\\!*\n\n" +
      "🛡️ Безопасный гарант при обмене NFT, скинов, подарков Telegram, крипты и фиата\\.\n\n" +
      "⚙️ *Возможности:*\n" +
      "🔹 Защищённые сделки за 1 минуту\n" +
      "🔹 15 валют: ГРН, РУБ, USDT, TON, Stars и др\\.\n" +
      "🔹 Поддержка 24/7 — ответ за 5 минут\n" +
      "🔹 19 783 успешных сделок\n\n" +
      "📌 *Выберите раздел кнопками снизу* 👇";

    await ctx.replyWithPhoto(img("welcome.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  });

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "❓ *Список команд*\n\n" +
      "/start — главное меню\n/wallet — кошелёк\n/stats — статистика\n/instruction — инструкция\n/support — поддержка\n\n" +
      "Или нажмите нужную кнопку снизу 👇",
      { parse_mode: "MarkdownV2", reply_markup: mainMenu() },
    );
  });

  // /add — только в чате администратора
  bot.command("add", async (ctx) => {
    if (ctx.chat?.id !== ADMIN_CHAT_ID) return;

    const args = (ctx.match as string | undefined)?.split(" ");
    if (!args || args.length < 3) {
      await ctx.reply("❌ Формат: `/add userId сумма валюта`\nПример: `/add 123456789 500 usdt`", { parse_mode: "MarkdownV2" });
      return;
    }
    try {
      const targetId = String(parseInt(args[0]));
      const amount = parseFloat(args[1]);
      const currency = normalizeCurrency(args[2]);
      if (!currency || isNaN(parseInt(targetId)) || isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ Неверные параметры\\. Пример: `/add 123456789 500 usdt`", { parse_mode: "MarkdownV2" });
        return;
      }
      const bal = await getOrCreateBalance(targetId);
      const dbKey = currency as CurrencyDbKey;
      const current = parseFloat((bal[dbKey] as string) ?? "0");
      const newVal = (current + amount).toFixed(8);
      await db.update(balancesTable).set({ [dbKey]: newVal }).where(eq(balancesTable.userId, targetId));

      await ctx.reply(`✅ Начислено *${num(amount)} ${CURRENCY_LABELS[currency]}* пользователю \`${targetId}\``, { parse_mode: "MarkdownV2" });
      try {
        await bot.api.sendMessage(parseInt(targetId),
          `💰 Ваш баланс пополнен на *${num(amount)} ${CURRENCY_LABELS[currency]}*\\!\n\nОткройте 💼 Кошелёк, чтобы проверить\\.`,
          { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
      } catch {}
    } catch {
      await ctx.reply("❌ Ошибка\\. Пример: `/add 123456789 500 usdt`", { parse_mode: "MarkdownV2" });
    }
  });

  // ── Функции для кнопок меню ──

  async function sendSupport(ctx: MyContext) {
    if (!isPrivate(ctx)) return;
    const caption =
      "🆘 *Служба поддержки King Garant Bot*\n\n" +
      `Официальный менеджер: 👤 ${esc(SUPPORT_USERNAME)}\n\n` +
      "⏱ *Ответ:* до 5 минут\n\n" +
      "📋 *Помогаем с:*\n• Спорными ситуациями\n• Пополнением баланса\n• Возвратом средств\n• Техническими вопросами\n\n" +
      `⚠️ *Официальный аккаунт — только ${esc(SUPPORT_USERNAME)}\\!*`;

    await ctx.replyWithPhoto(img("support.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  }

  async function sendInstruction(ctx: MyContext) {
    if (!isPrivate(ctx)) return;
    const caption =
      "📖 *Как создать безопасную сделку*\n\n" +
      `*Шаг 1 — Продавец:* Нажмите 🤝 Создать сделку, введите название, цену и валюту\\. Получите ссылку\\.\n\n` +
      `*Шаг 2 — Покупатель:* Перейдите по ссылке и нажмите «Оплатить»\\. Средства списываются с баланса\\.\n\n` +
      `*Шаг 3 — Передача:* Передайте товар ${esc(SUPPORT_USERNAME)}\\. Менеджер проверит и переведёт деньги продавцу\\.\n\n` +
      "✅ *Примеры:* NFT за 12 TON, Скин CS2 за 3200 РУБ, Подарок 500 Stars\n\n" +
      "💡 Пополните баланс через поддержку перед первой сделкой\\.";

    await ctx.replyWithPhoto(img("instruction.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  }

  async function sendStats(ctx: MyContext) {
    if (!isPrivate(ctx)) return;
    const allDeals = await db.select().from(dealsTable);
    const paid = allDeals.filter(d => d.status === "paid").length;
    const total = Math.max(paid + 19783, 19783);
    const caption =
      "📊 *Статистика King Garant Bot*\n\n" +
      `🤝 Успешных сделок: *${esc(total.toLocaleString("ru-RU"))}*\n` +
      "👥 Пользователей: *48 294*\n" +
      "⚡ Среднее время ответа: *0\\.2 сек*\n" +
      "🛡️ Безопасность: *100%*\n" +
      "💰 Оборот: *2 847 950 RUB*\n" +
      "📅 Работаем с: *2023 года*\n\n" +
      "🔒 За всё время — *ни одного случая мошенничества*\\.";

    await ctx.replyWithPhoto(img("stats.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  }

  async function sendWallet(ctx: MyContext) {
    if (!isPrivate(ctx)) return;
    const userId = String(ctx.from?.id ?? "");
    const bal = await getOrCreateBalance(userId);

    const fmt = (key: CurrencyDbKey, decimals = 2) =>
      parseFloat((bal[key] as string) ?? "0").toFixed(decimals);

    const caption =
      "💼 *Ваш кошелёк*\n" +
      `🆔 ID: \`${userId}\`\n\n` +
      "💵 *Баланс:*\n" +
      `▪️ ГРН: ${num(fmt("hrn"))} │ РУБ: ${num(fmt("rub"))} │ USD: ${num(fmt("usd"))}\n` +
      `▪️ EUR: ${num(fmt("eur"))} │ USDT: ${num(fmt("usdt"))} │ BTC: ${num(fmt("btc", 8))}\n` +
      `▪️ ETH: ${num(fmt("eth", 6))} │ TON: ${num(fmt("ton", 4))} │ SOL: ${num(fmt("sol", 4))}\n` +
      `▪️ NOT: ${num(fmt("notcoin"))} │ KZT: ${num(fmt("kzt"))} │ BYN: ${num(fmt("byn"))}\n` +
      `▪️ GBP: ${num(fmt("gbp"))} │ CNY: ${num(fmt("cny"))} │ Stars: ${num(fmt("stars", 0))}\n\n` +
      `📩 *Пополнение:* напишите ${esc(SUPPORT_USERNAME)}, сообщите ID и сумму\\.`;

    await ctx.replyWithPhoto(img("wallet.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  }

  // Reply Keyboard — кнопки снизу
  bot.hears("🆘 Поддержка",    ctx => sendSupport(ctx));
  bot.hears("📖 Инструкция",   ctx => sendInstruction(ctx));
  bot.hears("📊 Статистика",   ctx => sendStats(ctx));
  bot.hears("💼 Кошелёк",      ctx => sendWallet(ctx));

  // Команды "/" для тех же разделов
  bot.command("support",     ctx => sendSupport(ctx));
  bot.command("instruction", ctx => sendInstruction(ctx));
  bot.command("stats",       ctx => sendStats(ctx));
  bot.command("wallet",      ctx => sendWallet(ctx));

  // Создать сделку — Шаг 1 (название)
  bot.hears("🤝 Создать сделку", async (ctx) => {
    if (!isPrivate(ctx)) return;
    ctx.session.step = "title";
    const caption =
      "🤝 *Создание сделки — Шаг 1 из 3*\n\n" +
      "📦 *Введите название товара:*\n\n" +
      "✅ Примеры:\n• Скин AK\\-47 Redline MW CS2\n• NFT Notcoin \\#4821\n• Подарок Telegram 500 Stars\n• Аккаунт Steam MMR 4500";
    await ctx.replyWithPhoto(img("deal_create.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
  });

  // Callback: оплата сделки
  bot.callbackQuery(/^pay_/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      const dealId = ctx.callbackQuery.data.replace("pay_", "");
      const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.dealId, dealId)).limit(1);

      if (!deal || deal.status !== "active") {
        await ctx.reply("❌ Сделка не найдена или уже закрыта\\.", { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
        return;
      }

      const buyerId = String(ctx.from.id);
      const bal = await getOrCreateBalance(buyerId);
      const currency = deal.currency as Currency;
      const dbKey = currency as CurrencyDbKey;
      const price = parseFloat(deal.price as string);
      const have = parseFloat((bal[dbKey] as string) ?? "0");

      if (have < price) {
        await ctx.reply(
          `❌ *Недостаточно средств\\!*\nНужно: ${num(price)} ${CURRENCY_LABELS[currency]}\nУ вас: ${num(have.toFixed(4))} ${CURRENCY_LABELS[currency]}\n\nПополните баланс через ${esc(SUPPORT_USERNAME)}\\.`,
          { parse_mode: "MarkdownV2", reply_markup: mainMenu() },
        );
        return;
      }

      await db.update(balancesTable).set({ [dbKey]: (have - price).toFixed(8) }).where(eq(balancesTable.userId, buyerId));
      await db.update(dealsTable).set({ status: "paid", buyerId }).where(eq(dealsTable.dealId, dealId));

      const caption =
        `✅ *Сделка оплачена\\!*\n\n` +
        `📦 ${esc(deal.title)}\n💵 ${fmtPrice(deal.price as string)} ${CURRENCY_LABELS[currency]}\n\n` +
        `Ожидайте — продавец передаст товар менеджеру ${esc(SUPPORT_USERNAME)}\\.`;

      await ctx.replyWithPhoto(img("deal_paid.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });

      try {
        await bot.api.sendMessage(parseInt(deal.sellerId),
          `🔔 *Покупатель оплатил сделку\\!*\n\n📦 ${esc(deal.title)}\n💵 ${fmtPrice(deal.price as string)} ${CURRENCY_LABELS[currency]}\n\n👉 Передайте товар ${esc(SUPPORT_USERNAME)}\\. Менеджер переведёт деньги на ваш баланс\\.`,
          { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
      } catch {}
    } catch (err) {
      logger.error({ err }, "pay callback error");
      await ctx.reply("❌ Произошла ошибка\\. Попробуйте позже\\.", { parse_mode: "MarkdownV2" }).catch(() => {});
    }
  });

  // Callback: отмена / назад в меню
  bot.callbackQuery("menu_main", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Используйте кнопки меню ниже 👇", { reply_markup: mainMenu() }).catch(() => {});
  });

  // Callback: выбор валюты при создании сделки
  bot.callbackQuery(/^currency_/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      const currency = ctx.callbackQuery.data.replace("currency_", "") as Currency;
      if (!CURRENCY_LABELS[currency]) {
        await ctx.reply("❌ Неизвестная валюта\\.", { parse_mode: "MarkdownV2" });
        return;
      }
      const title = ctx.session.dealTitle;
      const price = ctx.session.dealPrice;
      if (!title || !price) {
        await ctx.reply("❌ Сессия истекла\\. Начните заново с кнопки 🤝 Создать сделку\\.", { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
        ctx.session = {};
        return;
      }
      ctx.session = {};

      const dealId = generateDealId();
      const sellerId = String(ctx.from.id);
      await db.insert(dealsTable).values({ dealId, sellerId, title, price: price.toString(), currency, status: "active" });

      const me = await bot.api.getMe();
      const dealLink = `https://t.me/${me.username}?start=deal_${dealId}`;

      const caption =
        `✅ *Сделка создана\\!*\n\n` +
        `📦 *Товар:* ${esc(title)}\n` +
        `💵 *Цена:* ${fmtPrice(price)} ${CURRENCY_LABELS[currency]}\n` +
        `🆔 *ID:* \`${dealId}\`\n\n` +
        `🔗 *Ссылка для покупателя:*\n\`${esc(dealLink)}\`\n\n` +
        `📋 Отправьте ссылку покупателю → он оплатит → передайте товар ${esc(SUPPORT_USERNAME)}\\.`;

      await ctx.replyWithPhoto(img("deal_created.png"), { caption, parse_mode: "MarkdownV2", reply_markup: mainMenu() });
    } catch (err) {
      logger.error({ err }, "currency callback error");
      await ctx.reply("❌ Ошибка\\. Попробуйте ещё раз\\.", { parse_mode: "MarkdownV2" }).catch(() => {});
    }
  });

  // FSM — ввод текста (только личка)
  bot.on("message", async (ctx) => {
    if (!isPrivate(ctx)) return;
    const step = ctx.session.step;
    const text = ctx.message.text;
    if (!text || text.startsWith("/")) return;

    const menuLabels = ["🤝 Создать сделку", "💼 Кошелёк", "📊 Статистика", "📖 Инструкция", "🆘 Поддержка"];
    if (menuLabels.includes(text)) return;

    if (step === "title") {
      ctx.session.dealTitle = text;
      ctx.session.step = "price";
      await ctx.replyWithPhoto(img("deal_create.png"), {
        caption: `✅ Название: *${esc(text)}*\n\n💰 *Шаг 2 из 3 — Введите цену:*\n\nПримеры: \`500\`, \`1250\`, \`12.5\``,
        parse_mode: "MarkdownV2",
        reply_markup: mainMenu(),
      });
      return;
    }

    if (step === "price") {
      const price = parseFloat(text.replace(",", "."));
      if (isNaN(price) || price <= 0) {
        await ctx.reply("❌ Неверный формат\\. Введите число, например: `1500` или `12\\.5`", { parse_mode: "MarkdownV2", reply_markup: mainMenu() });
        return;
      }
      ctx.session.dealPrice = price;
      await ctx.replyWithPhoto(img("deal_create.png"), {
        caption: `✅ Цена: *${fmtPrice(price)}*\n\n💱 *Шаг 3 из 3 — Выберите валюту:*`,
        parse_mode: "MarkdownV2",
        reply_markup: currencyKeyboard(),
      });
      return;
    }
  });

  bot.catch((err) => {
    logger.error({ err: err.error }, "Bot error");
  });

  return bot;
}
