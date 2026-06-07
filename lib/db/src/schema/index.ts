import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const balancesTable = pgTable("balances", {
  userId:    text("user_id").primaryKey(),
  hrn:       text("hrn").notNull().default("0"),
  rub:       text("rub").notNull().default("0"),
  ton:       text("ton").notNull().default("0"),
  stars:     text("stars").notNull().default("0"),
  usd:       text("usd").notNull().default("0"),
  eur:       text("eur").notNull().default("0"),
  usdt:      text("usdt").notNull().default("0"),
  btc:       text("btc").notNull().default("0"),
  eth:       text("eth").notNull().default("0"),
  kzt:       text("kzt").notNull().default("0"),
  byn:       text("byn").notNull().default("0"),
  gbp:       text("gbp").notNull().default("0"),
  cny:       text("cny").notNull().default("0"),
  not_coin:  text("not_coin").notNull().default("0"),
  sol:       text("sol").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dealsTable = pgTable("deals", {
  dealId:    text("deal_id").primaryKey(),
  sellerId:  text("seller_id").notNull(),
  buyerId:   text("buyer_id"),
  title:     text("title").notNull(),
  price:     text("price").notNull(),
  currency:  text("currency").notNull(),
  status:    text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
