CREATE TABLE "oauth_auth_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"state" text,
	"code_challenge" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"resource" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"resource" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret" text,
	"client_secret_expires_at" integer,
	"redirect_uris" jsonb NOT NULL,
	"client_name" text,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"type" varchar(10) NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"resource" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_id_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_client_id_idx" ON "oauth_tokens" USING btree ("client_id");