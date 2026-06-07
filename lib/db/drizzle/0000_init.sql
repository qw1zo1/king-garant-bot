CREATE TABLE "balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hrn" text DEFAULT '0' NOT NULL,
	"rub" text DEFAULT '0' NOT NULL,
	"ton" text DEFAULT '0' NOT NULL,
	"stars" text DEFAULT '0' NOT NULL,
	"usd" text DEFAULT '0' NOT NULL,
	"eur" text DEFAULT '0' NOT NULL,
	"usdt" text DEFAULT '0' NOT NULL,
	"btc" text DEFAULT '0' NOT NULL,
	"eth" text DEFAULT '0' NOT NULL,
	"kzt" text DEFAULT '0' NOT NULL,
	"byn" text DEFAULT '0' NOT NULL,
	"gbp" text DEFAULT '0' NOT NULL,
	"cny" text DEFAULT '0' NOT NULL,
	"not_coin" text DEFAULT '0' NOT NULL,
	"sol" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"deal_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"buyer_id" text,
	"title" text NOT NULL,
	"price" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
