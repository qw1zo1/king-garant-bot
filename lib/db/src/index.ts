import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Client } = pg;

export let client: pg.Client | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let db: any = null;

const isProduction = process.env.NODE_ENV === "production";

function tryDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Parse a postgres[ql]:// URL using only string operations.
 * Never calls new URL(), never calls pg-connection-string.
 */
function parsePgUrl(raw: string): pg.ClientConfig | null {
  try {
    const clean = raw.trim();

    let s = clean;
    if (s.startsWith("postgresql://")) s = s.slice("postgresql://".length);
    else if (s.startsWith("postgres://")) s = s.slice("postgres://".length);
    else {
      console.error("[db] DATABASE_URL does not start with postgres[ql]:// — value:", clean.slice(0, 30));
      return null;
    }

    // Strip query string and fragment
    const qIdx = s.indexOf("?");
    if (qIdx >= 0) s = s.slice(0, qIdx);
    const fIdx = s.indexOf("#");
    if (fIdx >= 0) s = s.slice(0, fIdx);

    // Find userinfo@hostpart — use LAST @ to handle encoded @ in passwords
    const atIdx = s.lastIndexOf("@");
    if (atIdx < 0) {
      console.error("[db] DATABASE_URL missing @ separator — URL appears incomplete. Copy the full Internal Connection String from Render PostgreSQL service page.");
      return null;
    }

    const userinfo = s.slice(0, atIdx);
    const hostpart = s.slice(atIdx + 1).trim();

    // Split user:password (first colon only)
    const colonIdx = userinfo.indexOf(":");
    const user = (colonIdx >= 0 ? userinfo.slice(0, colonIdx) : userinfo).trim();
    const password = (colonIdx >= 0 ? userinfo.slice(colonIdx + 1) : "").trim();

    // Split hostpart into host[:port] / database
    const slashIdx = hostpart.indexOf("/");
    const hostPort = (slashIdx >= 0 ? hostpart.slice(0, slashIdx) : hostpart).trim();
    const database = (slashIdx >= 0 ? hostpart.slice(slashIdx + 1) : "").trim();

    // Split host:port — use LAST : to handle IPv6 addresses
    const lastColon = hostPort.lastIndexOf(":");
    const host = (lastColon >= 0 ? hostPort.slice(0, lastColon) : hostPort).trim();
    const portStr = lastColon >= 0 ? hostPort.slice(lastColon + 1) : "5432";

    if (!host) {
      console.error("[db] DATABASE_URL parsed host is empty");
      return null;
    }

    console.log(`[db] Parsed OK → host=${host}, port=${portStr}, db=${database}`);
    return {
      host,
      port: parseInt(portStr, 10) || 5432,
      user: tryDecode(user),
      password: tryDecode(password),
      database: tryDecode(database),
    };
  } catch (e) {
    console.error("[db] parsePgUrl threw:", e);
    return null;
  }
}

const rawDbUrl = process.env.DATABASE_URL;

if (rawDbUrl) {
  const dbUrl = rawDbUrl.trim();
  console.log(`[db] DATABASE_URL present: len=${dbUrl.length}, hasAt=${dbUrl.includes("@")}, scheme=${dbUrl.slice(0, 15)}`);

  const params = parsePgUrl(dbUrl);
  if (params) {
    client = new Client({
      ...params,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });
    db = drizzle(client, { schema });
  } else {
    console.error("[db] FATAL: Could not parse DATABASE_URL. DB is unavailable.");
    console.error("[db] Expected format: postgresql://USER:PASSWORD@HOST/DATABASE");
    console.error("[db] Go to Render → PostgreSQL service → Connect → copy Internal Connection String");
  }
} else {
  console.warn("[db] DATABASE_URL not set — no database");
}

/** Connect to the database. Must be called once at startup before any queries. */
export async function connectDb(): Promise<boolean> {
  if (!client) return false;
  try {
    await client.connect();
    return true;
  } catch (err) {
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("already been connected")) return true;
    console.error("[db] connectDb failed:", msg);
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
