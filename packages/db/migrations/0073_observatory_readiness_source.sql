-- One trusted Commandry readiness endpoint. Existing sources and grants are unchanged.
ALTER TABLE observatory_source DROP CONSTRAINT IF EXISTS observatory_source_kind_check;
--> statement-breakpoint
ALTER TABLE observatory_source ADD CONSTRAINT observatory_source_kind_check CHECK(kind IN ('infraagent-monitor','github-repository','http-readiness') AND (kind <> 'http-readiness' OR external_id = 'commandry-web-readiness'));
