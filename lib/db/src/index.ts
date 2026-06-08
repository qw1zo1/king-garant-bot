import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Client } = pg;

export let client: pg.Client | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let db: any = null;

const isProduction = process.env.NODE_ENV === "production";

/** Parse a postgres[ql]:// URL into individual connection params — NEVER uses pg-connection-string */
function parsePgUrl(url: string): pg.ClientConfig | null {
  // Regex handles: postgres[ql]://user:pass@host[:port]/database[?...]
  const m = url.match(
    /^postgres(?:ql)?:\/\/([^:@]*):([^@]*)@([^:/?#]+)(?::(\d+))?\/([^?#]*)/,
  );
  if (!m) return null;
  const safePort = Number(m[4] ?? "5432") || 5432;
  return {
    user: decodeURIComponent(m[1] ?? ""),
    password: decodeURIComponent(m[2] ?? ""),
    host: m[3] ?? "localhost",
    port: safePort,
    database: decodeURIComponent(m[5] ?? ""),
  };
}

const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
  const params = parsePgUrl(dbUrl);
  if (params) {
    client = new Client({
      ...params,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });
  } else {
    // Last resort: pass raw connection string and hope pg parses it
    client = new Client({
      connectionString: dbUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });
  }
  db = drizzle(client, { schema });
}

/** Connect to the database. Must be called once at startup before any queries. */
export async function connectDb(): Promise<boolean> {
  if (!client) return false;
  try {
    await client.connect();
    return true;
  } catch (err) {
    // Ignore "already connected" error, treat as success
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("already been connected")) return true;
    return false;
  }
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
