import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function runMigrations() {
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
    );
    CREATE TABLE IF NOT EXISTS "deals" (
      "deal_id"    text PRIMARY KEY NOT NULL,
      "seller_id"  text NOT NULL,
      "buyer_id"   text,
      "title"      text NOT NULL,
      "price"      text NOT NULL,
      "currency"   text NOT NULL,
      "status"     text NOT NULL DEFAULT 'active',
      "created_at" timestamp NOT NULL DEFAULT now()
    );
  `);
}

export * from "./schema";
