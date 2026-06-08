import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

const dbUrl = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";

if (dbUrl) {
  try {
    // Parse URL manually to avoid pg-connection-string parsing bugs on some Render URLs
    const parsed = new URL(dbUrl);
    pool = new Pool({
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432"),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  } catch {
    // URL parsing failed — fallback to connection string
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  db = drizzle(pool, { schema });
}

export async function runMigrations() {
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "balances" (
      "user_id"    text PRIMARY KEY NOT NULL,
      "hrn"        text NOT NULL DEFAULT '0',
      "rub"        text NOT NULL DEFAULT '0',
      "ton"        text NOT NULL DEFAULT '0',
      "stars"      text NOT NULL DEFAULT '0',
      "usd"        text NOT NULL DEFAULT '0',
      "eur"        text NOT NULL DEFAULT '0',
      "usdt"       text NOT NULL DEFAULT '0',
      "btc"        text NOT NULL DEFAULT '0',
      "eth"        text NOT NULL DEFAULT '0',
      "kzt"        text NOT NULL DEFAULT '0',
      "byn"        text NOT NULL DEFAULT '0',
      "gbp"        text NOT NULL DEFAULT '0',
      "cny"        text NOT NULL DEFAULT '0',
      "not_coin"   text NOT NULL DEFAULT '0',
      "sol"        text NOT NULL DEFAULT '0',
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "deals" (
      "deal_id"    text PRIMARY KEY NOT NULL,
      "seller_id"  text NOT NULL,
      "buyer_id"   text,
      "title"      text NOT NULL,
      "price"      text NOT NULL,
      "currency"   text NOT NULL,
      "status"     text NOT NULL DEFAULT 'active',
      "created_at" timestamp NOT NULL DEFAULT now()
    )
  `);
}

export * from "./schema";
