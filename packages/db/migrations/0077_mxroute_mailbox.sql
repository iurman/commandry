ALTER TABLE "mail_account" DROP CONSTRAINT "mail_account_provider";--> statement-breakpoint
ALTER TABLE "mail_account" ALTER COLUMN "received_cursor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "mail_account" ALTER COLUMN "sent_cursor" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "mail_account" ADD CONSTRAINT "mail_account_provider" CHECK ("mail_account"."provider" in ('resend','mxroute'));