import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot";
import { connectDb, runMigrations } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  // Connect to DB then run migrations
  const connected = await connectDb();
  if (connected) {
    try {
      await runMigrations();
      logger.info("Database ready");
    } catch (err) {
      logger.warn({ err }, "Migrations failed — DB may not be fully set up");
    }
  } else {
    logger.warn("No DATABASE_URL — running without database");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");

    // Keep-alive ping every 10 min so Render free tier doesn't spin down
    setInterval(() => {
      import("node:http").then(({ default: http }) => {
        http.get(`http://localhost:${port}/api/healthz`, () => {}).on("error", () => {});
      });
    }, 10 * 60 * 1000);
  });

  // Start Telegram bot (polling only in production — avoids 409 conflicts with Render)
  if (process.env.NODE_ENV !== "production") {
    logger.info("Dev mode: skipping bot polling (run on Render for live bot)");
  } else {
    const bot = createBot();
    if (bot) {
      logger.info("Telegram bot initializing...");
      bot.start({
        onStart: (info) => logger.info({ username: info.username }, "Bot started"),
      }).catch((err: unknown) => {
        const code = (err as { error_code?: number })?.error_code;
        if (code === 409) {
          logger.warn("Bot 409 conflict — another instance already running");
        } else {
          logger.error({ err }, "Bot stopped with error");
        }
      });
    }
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
