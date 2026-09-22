CREATE TABLE IF NOT EXISTS "interview_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"domain_id" text NOT NULL,
	"provider" text,
	"timestamp" timestamp with time zone DEFAULT now(),
	"thinking_duration_ms" integer,
	"streaming_duration_ms" integer,
	"total_duration_ms" integer,
	"tokens_used" integer,
	"error_type" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"total_domains_completed" integer DEFAULT 0 NOT NULL,
	"primary_provider" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
-- Some development environments created these tables with `drizzle-kit push`
-- before this migration was generated. Normalize their original text-backed
-- counters and flags without breaking fresh installations.
ALTER TABLE "interview_sessions"
	ALTER COLUMN "total_messages" DROP DEFAULT,
	ALTER COLUMN "total_messages" TYPE integer USING COALESCE(NULLIF("total_messages"::text, '')::integer, 0),
	ALTER COLUMN "total_messages" SET DEFAULT 0,
	ALTER COLUMN "total_messages" SET NOT NULL,
	ALTER COLUMN "total_domains_completed" DROP DEFAULT,
	ALTER COLUMN "total_domains_completed" TYPE integer USING COALESCE(NULLIF("total_domains_completed"::text, '')::integer, 0),
	ALTER COLUMN "total_domains_completed" SET DEFAULT 0,
	ALTER COLUMN "total_domains_completed" SET NOT NULL,
	ALTER COLUMN "is_complete" DROP DEFAULT,
	ALTER COLUMN "is_complete" TYPE boolean USING COALESCE(NULLIF("is_complete"::text, '')::boolean, false),
	ALTER COLUMN "is_complete" SET DEFAULT false,
	ALTER COLUMN "is_complete" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "interview_messages"
	ALTER COLUMN "thinking_duration_ms" TYPE integer USING NULLIF("thinking_duration_ms"::text, '')::integer,
	ALTER COLUMN "streaming_duration_ms" TYPE integer USING NULLIF("streaming_duration_ms"::text, '')::integer,
	ALTER COLUMN "total_duration_ms" TYPE integer USING NULLIF("total_duration_ms"::text, '')::integer,
	ALTER COLUMN "tokens_used" TYPE integer USING NULLIF("tokens_used"::text, '')::integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_messages" ADD CONSTRAINT "interview_messages_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_messages_session_timestamp_idx" ON "interview_messages" USING btree ("session_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_user_id_idx" ON "interview_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interview_sessions_project_id_idx" ON "interview_sessions" USING btree ("project_id");
