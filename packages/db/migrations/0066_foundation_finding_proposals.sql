-- Scope and provenance only. Capture, Knowledge and foundation memory own content.
CREATE UNIQUE INDEX IF NOT EXISTS capture_triage_suggestion_id_capture_idx ON public.capture_triage_suggestion(id,capture_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS capture_triage_decision_id_capture_idx ON public.capture_triage_decision(id,capture_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_finding_proposal (
 proposal_id uuid PRIMARY KEY,
 capture_id uuid NOT NULL UNIQUE,
 project_id uuid NOT NULL,
 environment text NOT NULL,
 creation_transaction text NOT NULL DEFAULT pg_current_xact_id()::text,
 CONSTRAINT foundation_finding_proposal_scope_idx UNIQUE(proposal_id,project_id),
 CONSTRAINT foundation_finding_proposal_capture_fk FOREIGN KEY(capture_id,project_id) REFERENCES public.capture(id,project_id),
 CONSTRAINT foundation_finding_proposal_suggestion_fk FOREIGN KEY(proposal_id,capture_id) REFERENCES public.capture_triage_suggestion(id,capture_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_finding_citation (
 proposal_id uuid NOT NULL,
 project_id uuid NOT NULL,
 evidence_id uuid NOT NULL,
 ordinal integer NOT NULL,
 PRIMARY KEY(proposal_id,evidence_id),
 CONSTRAINT foundation_finding_citation_order_idx UNIQUE(proposal_id,ordinal),
 CONSTRAINT foundation_finding_citation_proposal_fk FOREIGN KEY(proposal_id,project_id) REFERENCES public.foundation_finding_proposal(proposal_id,project_id),
 CONSTRAINT foundation_finding_citation_evidence_fk FOREIGN KEY(evidence_id,project_id) REFERENCES public.foundation_evidence(id,project_id),
 CONSTRAINT foundation_finding_citation_order_valid CHECK(ordinal BETWEEN 0 AND 99)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_finding_filing (
 proposal_id uuid PRIMARY KEY,
 project_id uuid NOT NULL,
 capture_id uuid NOT NULL,
 decision_id uuid NOT NULL UNIQUE,
 knowledge_id uuid NOT NULL UNIQUE,
 memory_id uuid NOT NULL UNIQUE,
 memory_version integer NOT NULL CHECK(memory_version=1),
 anchor_evidence_id uuid NOT NULL UNIQUE,
 creation_transaction text NOT NULL DEFAULT pg_current_xact_id()::text,
 CONSTRAINT foundation_finding_filing_proposal_fk FOREIGN KEY(proposal_id,project_id) REFERENCES public.foundation_finding_proposal(proposal_id,project_id),
 CONSTRAINT foundation_finding_filing_capture_fk FOREIGN KEY(capture_id,project_id) REFERENCES public.capture(id,project_id),
 CONSTRAINT foundation_finding_filing_decision_fk FOREIGN KEY(decision_id,capture_id) REFERENCES public.capture_triage_decision(id,capture_id),
 CONSTRAINT foundation_finding_filing_knowledge_fk FOREIGN KEY(knowledge_id,project_id) REFERENCES public.knowledge_item(id,project_id),
 CONSTRAINT foundation_finding_filing_memory_fk FOREIGN KEY(memory_id,memory_version,project_id) REFERENCES public.foundation_memory_revision(memory_id,version,project_id),
 CONSTRAINT foundation_finding_filing_evidence_fk FOREIGN KEY(anchor_evidence_id,project_id) REFERENCES public.foundation_evidence(id,project_id)
);
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion DROP CONSTRAINT IF EXISTS capture_triage_suggestion_confidence_valid;
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion ADD CONSTRAINT capture_triage_suggestion_confidence_valid CHECK (((rule_version = 'capture-triage/v1' AND confidence BETWEEN 0 AND 100 AND body IS NULL AND proposal IS NULL) OR (rule_version IN ('agent-task-proposal/v1','agent-finding-proposal/v1') AND confidence IS NULL AND body IS NOT NULL AND proposal IS NOT NULL)) IS TRUE);
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion DROP CONSTRAINT IF EXISTS capture_triage_suggestion_rule_v1;
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion ADD CONSTRAINT capture_triage_suggestion_rule_v1 CHECK(rule_version IN ('capture-triage/v1','agent-task-proposal/v1','agent-finding-proposal/v1'));
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion DROP CONSTRAINT IF EXISTS capture_triage_suggestion_source_local;
--> statement-breakpoint
ALTER TABLE public.capture_triage_suggestion ADD CONSTRAINT capture_triage_suggestion_source_local CHECK(((rule_version='capture-triage/v1' AND source_label='Local deterministic rule') OR (rule_version='agent-task-proposal/v1' AND source_label='Agent task proposal') OR (rule_version='agent-finding-proposal/v1' AND source_label='Agent finding proposal')) IS TRUE);
--> statement-breakpoint
-- Closed finding bindings have ASCII object keys and only JSON primitives/arrays.
CREATE OR REPLACE FUNCTION public.commandry_finding_canonical_json(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result text;
BEGIN
 CASE jsonb_typeof(value)
 WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.commandry_finding_canonical_json(v),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(value) AS entry(key,v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(public.commandry_finding_canonical_json(v),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS entry(v,ordinal);
 WHEN 'number' THEN
  IF value::numeric<>trunc(value::numeric) OR abs(value::numeric)>9007199254740991 THEN
   RAISE EXCEPTION 'Finding JSON numbers must be safe integers' USING ERRCODE='23514',CONSTRAINT='foundation_finding_number';
  END IF;
  result:=(value::numeric)::bigint::text;
 ELSE result:=value::text;
 END CASE;
 RETURN result;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_finding_digest(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(sha256(convert_to(public.commandry_finding_canonical_json(value),'UTF8')),'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_finding_text(value text, maximum integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT (value IS NOT NULL AND length(btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0 AND length(value)+regexp_count(value,'['||chr(65536)||'-'||chr(1114111)||']')<=maximum) IS TRUE
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_assert_finding_proposal(source_id uuid,initial_knowledge_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 c public.capture%ROWTYPE; s public.capture_triage_suggestion%ROWTYPE;
 d public.capture_triage_decision%ROWTYPE; p public.foundation_finding_proposal%ROWTYPE;
 f public.foundation_finding_filing%ROWTYPE; k public.knowledge_item%ROWTYPE;
 client public.foundation_client%ROWTYPE; e public.foundation_evidence%ROWTYPE;
 m public.foundation_memory%ROWTYPE; r public.foundation_memory_revision%ROWTYPE;
 b jsonb; citations jsonb; citation jsonb; expected jsonb; memory_content jsonb;
 source_hash text; proposal_hash text; content text; n integer; initial boolean;
BEGIN
 SELECT * INTO c FROM public.capture WHERE id=source_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO s FROM public.capture_triage_suggestion WHERE capture_id=c.id;
 SELECT * INTO d FROM public.capture_triage_decision WHERE capture_id=c.id;
 SELECT * INTO p FROM public.foundation_finding_proposal WHERE capture_id=c.id;
 b:=s.proposal->'binding'; citations:=b->'citations';
 IF c.source IS DISTINCT FROM 'foundation-client' OR s.rule_version IS DISTINCT FROM 'agent-finding-proposal/v1'
 OR p.proposal_id IS DISTINCT FROM s.id OR p.project_id IS DISTINCT FROM c.project_id
 OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR jsonb_typeof(citations) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Finding scope is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_scope';
 END IF;
 SELECT * INTO client FROM public.foundation_client WHERE id::text=b->>'clientId';
 source_hash:=encode(sha256(convert_to(c.original_content,'UTF8')),'hex');
 proposal_hash:=public.commandry_finding_digest(b);
 expected:=jsonb_build_object('schemaVersion',1,'proposalId',s.id::text,'captureId',c.id::text,
 'projectId',c.project_id::text,'environment',client.environment,'clientId',client.id::text,
 'principalId',c.author,'correlationId',b->>'correlationId','submittedAt',b->>'submittedAt',
 'sourceDigest',source_hash,'proposalVersion',1,'proposedTitle',s.title,'proposedBody',s.body,
 'rationale',s.rationale,'citations',citations,'citationsDigest',public.commandry_finding_digest(citations),
 'runtime',NULL,'model',NULL,'runId',NULL);
 IF client.id IS NULL OR client.project_id IS DISTINCT FROM c.project_id OR p.environment IS DISTINCT FROM client.environment
 OR c.author IS DISTINCT FROM 'foundation-client:'||client.id::text
 OR (b=expected) IS DISTINCT FROM TRUE
 OR (b->>'correlationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') IS DISTINCT FROM TRUE
 OR b->>'submittedAt' IS DISTINCT FROM to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 OR c.created_at IS DISTINCT FROM date_trunc('milliseconds',c.created_at)
 OR s.created_at IS DISTINCT FROM c.created_at OR s.proposed_project_id IS DISTINCT FROM c.project_id
 OR s.kind IS DISTINCT FROM 'note' OR s.confidence IS NOT NULL OR s.source_label IS DISTINCT FROM 'Agent finding proposal'
 OR s.proposal IS DISTINCT FROM jsonb_build_object('binding',b,'contentDigest',proposal_hash)
 OR c.input_type IS DISTINCT FROM 'text' OR NOT public.commandry_finding_text(c.original_content,20000)
 OR NOT public.commandry_finding_text(s.title,200)
 OR NOT public.commandry_finding_text(s.body,20000)
 OR NOT public.commandry_finding_text(s.rationale,4000)
 OR EXISTS(SELECT 1 FROM public.capture_file WHERE capture_id=c.id)
 OR EXISTS(SELECT 1 FROM public.work_item WHERE source_capture_id=c.id)
 OR jsonb_array_length(citations) NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Finding binding is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_binding';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('evidenceId',evidence_id::text,'ordinal',ordinal) ORDER BY ordinal),'[]'::jsonb) INTO expected FROM public.foundation_finding_citation WHERE proposal_id=p.proposal_id AND project_id=c.project_id;
 SELECT jsonb_agg(jsonb_build_object('evidenceId',v->>'evidenceId','ordinal',ord-1) ORDER BY ord) INTO memory_content FROM jsonb_array_elements(citations) WITH ORDINALITY AS entry(v,ord);
 IF expected IS DISTINCT FROM memory_content THEN
  RAISE EXCEPTION 'Finding ordered citation membership is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_citations';
 END IF;
 initial:=p.creation_transaction=pg_current_xact_id()::text;
 FOR citation IN SELECT value FROM jsonb_array_elements(citations) LOOP
  SELECT * INTO e FROM public.foundation_evidence WHERE id::text=citation->>'evidenceId' AND project_id=c.project_id FOR SHARE;
  IF e.id IS NULL OR e.source_kind NOT IN ('capture','knowledge_revision')
  OR citation IS DISTINCT FROM jsonb_build_object('evidenceId',e.id::text,'sourceKind',e.source_kind,'sourceId',e.source_id,'sourceVersion',e.source_version,'contentDigest',e.content_digest,'selection','whole_source') THEN
   RAISE EXCEPTION 'Finding citation identity is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_citation_identity';
  END IF;
  IF initial THEN
   content:=NULL;
   IF e.source_kind='capture' THEN
    SELECT original_content INTO content FROM public.capture WHERE id=e.capture_id AND project_id=c.project_id FOR SHARE;
   ELSE
    SELECT * INTO k FROM public.knowledge_item WHERE id=e.knowledge_item_id AND project_id=c.project_id FOR SHARE;
    IF k.version=e.knowledge_version THEN content:=k.content;
    ELSIF e.knowledge_version=1 AND k.version>1 THEN SELECT previous_content INTO content FROM public.knowledge_item_revision WHERE knowledge_item_id=k.id AND version=2 FOR SHARE;
    ELSIF k.version>e.knowledge_version THEN SELECT kr.content INTO content FROM public.knowledge_item_revision kr WHERE knowledge_item_id=k.id AND version=e.knowledge_version FOR SHARE;
    END IF;
   END IF;
   IF e.availability IS DISTINCT FROM 'available' OR content IS NULL OR encode(sha256(convert_to(content,'UTF8')),'hex') IS DISTINCT FROM e.content_digest THEN
    RAISE EXCEPTION 'Finding source bytes are unavailable' USING ERRCODE='23514',CONSTRAINT='foundation_finding_source_bytes';
   END IF;
  END IF;
 END LOOP;
 SELECT * INTO f FROM public.foundation_finding_filing WHERE proposal_id=p.proposal_id;
 SELECT count(*) INTO n FROM public.knowledge_item WHERE source_capture_id=c.id;
 IF d.id IS NULL OR d.decision='reject' THEN
  IF c.state IS DISTINCT FROM 'unfiled' OR n<>0 OR f.proposal_id IS NOT NULL THEN
   RAISE EXCEPTION 'Finding needs approval before filing' USING ERRCODE='23514',CONSTRAINT='foundation_finding_owner_decision';
  END IF;
 END IF;
 IF d.id IS NULL THEN RETURN; END IF;
 IF d.suggestion_id IS DISTINCT FROM s.id OR (d.actor LIKE 'user:%' AND length(trim(substring(d.actor from 6)))>0) IS DISTINCT FROM TRUE
 OR d.created_at IS DISTINCT FROM date_trunc('milliseconds',d.created_at)
 OR d.provenance IS DISTINCT FROM jsonb_build_object('schemaVersion',1,'projectId',c.project_id::text,'environment',client.environment,
 'proposalVersion',1,'proposalDigest',proposal_hash,'sourceDigest',source_hash,'citationsDigest',public.commandry_finding_digest(citations),
 'reviewedBy',d.actor,'correlationId',d.provenance->>'correlationId','reason',d.provenance->>'reason')
 OR (d.provenance->>'correlationId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') IS DISTINCT FROM TRUE
 OR NOT public.commandry_finding_text(d.provenance->>'reason',4000) THEN
  RAISE EXCEPTION 'Finding owner provenance is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_decision';
 END IF;
 IF d.decision='reject' THEN RETURN; END IF;
 SELECT * INTO k FROM public.knowledge_item WHERE id=d.filed_record_id;
 IF d.decision IS DISTINCT FROM 'approve' OR d.selected_kind IS DISTINCT FROM 'note' OR d.selected_project_id IS DISTINCT FROM c.project_id
 OR NOT public.commandry_finding_text(d.selected_title,200)
 OR NOT public.commandry_finding_text(d.selected_body,20000)
 OR c.state IS DISTINCT FROM 'filed' OR c.filed_record_kind IS DISTINCT FROM 'note' OR c.filed_record_id IS DISTINCT FROM d.filed_record_id
 OR c.filed_at IS DISTINCT FROM d.created_at OR n<>1 OR k.id IS NULL OR k.source_capture_id IS DISTINCT FROM c.id OR k.project_id IS DISTINCT FROM c.project_id
 OR f.proposal_id IS NULL OR f.capture_id IS DISTINCT FROM c.id OR f.project_id IS DISTINCT FROM c.project_id OR f.decision_id IS DISTINCT FROM d.id OR f.knowledge_id IS DISTINCT FROM k.id OR f.memory_version IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'Finding canonical filing is invalid' USING ERRCODE='23514',CONSTRAINT='foundation_finding_filing';
 END IF;
 initial:=f.creation_transaction=pg_current_xact_id()::text OR initial_knowledge_id=k.id;
 IF initial AND (k.kind IS DISTINCT FROM 'note' OR k.title IS DISTINCT FROM d.selected_title OR k.content IS DISTINCT FROM d.selected_body OR k.version<>1 OR k.url IS NOT NULL OR k.created_at IS DISTINCT FROM d.created_at OR k.updated_at IS DISTINCT FROM d.created_at) THEN
  RAISE EXCEPTION 'Initial Knowledge differs from owner selection' USING ERRCODE='23514',CONSTRAINT='foundation_finding_initial_knowledge';
 END IF;
 SELECT * INTO m FROM public.foundation_memory WHERE id=f.memory_id AND project_id=c.project_id;
 SELECT * INTO r FROM public.foundation_memory_revision WHERE memory_id=f.memory_id AND version=1 AND project_id=c.project_id;
 SELECT * INTO e FROM public.foundation_evidence WHERE id=f.anchor_evidence_id AND project_id=c.project_id;
 memory_content:=jsonb_build_object('statement',d.selected_body,'category','finding','evidenceIds',jsonb_build_array(f.anchor_evidence_id::text)||(SELECT jsonb_agg(v->'evidenceId' ORDER BY ord) FROM jsonb_array_elements(citations) WITH ORDINALITY AS entry(v,ord)), 'relatedMemoryIds','[]'::jsonb,'relationType',NULL);
 IF m.id IS NULL OR m.knowledge_item_id IS DISTINCT FROM k.id OR r.memory_id IS NULL
 OR r.statement IS DISTINCT FROM d.selected_body OR r.category IS DISTINCT FROM 'finding' OR r.relation_type IS NOT NULL
 OR r.recorded_by IS DISTINCT FROM d.actor OR r.recorded_at IS DISTINCT FROM d.created_at
 OR r.anchor_evidence_id IS DISTINCT FROM f.anchor_evidence_id OR r.anchor_knowledge_version IS DISTINCT FROM 1
 OR r.content_digest IS DISTINCT FROM public.commandry_finding_digest(memory_content)
 OR e.id IS NULL OR e.source_kind IS DISTINCT FROM 'knowledge_revision' OR e.knowledge_item_id IS DISTINCT FROM k.id
 OR e.source_id IS DISTINCT FROM k.id::text OR e.knowledge_version IS DISTINCT FROM 1 OR e.source_version IS DISTINCT FROM '1'
 OR e.content_digest IS DISTINCT FROM encode(sha256(convert_to(d.selected_body,'UTF8')),'hex')
 OR e.recorded_by IS DISTINCT FROM d.actor OR e.ingested_at IS DISTINCT FROM d.created_at OR e.observed_at IS NOT NULL
 OR (length(trim(e.locator))>0) IS DISTINCT FROM TRUE
 OR EXISTS(SELECT 1 FROM public.foundation_memory_relation WHERE memory_id=f.memory_id AND version=1)
 OR EXISTS(SELECT 1 FROM public.foundation_instruction_approval WHERE memory_id=f.memory_id AND version=1)
 OR EXISTS(SELECT 1 FROM public.foundation_finding_citation WHERE proposal_id=p.proposal_id AND evidence_id=e.id) THEN
  RAISE EXCEPTION 'Finding initial memory and anchor disagree' USING ERRCODE='23514',CONSTRAINT='foundation_finding_memory';
 END IF;
 SELECT coalesce(jsonb_agg(evidence_id::text ORDER BY ordinal),'[]'::jsonb) INTO expected FROM public.foundation_memory_evidence WHERE memory_id=f.memory_id AND version=1 AND project_id=c.project_id;
 IF expected IS DISTINCT FROM memory_content->'evidenceIds' THEN
  RAISE EXCEPTION 'Finding memory citations disagree' USING ERRCODE='23514',CONSTRAINT='foundation_finding_memory_citations';
 END IF;
 IF initial AND (m.current_version<>1 OR m.lifecycle IS DISTINCT FROM 'proposed' OR m.verification IS DISTINCT FROM 'unverified' OR e.availability IS DISTINCT FROM 'available' OR e.verification IS DISTINCT FROM 'unverified' OR r.creation_transaction IS DISTINCT FROM f.creation_transaction OR EXISTS(SELECT 1 FROM public.foundation_memory_alias WHERE memory_id=f.memory_id)) THEN
  RAISE EXCEPTION 'Finding filing grants no review or verification' USING ERRCODE='23514',CONSTRAINT='foundation_finding_initial_authority';
 END IF;
END $$;
--> statement-breakpoint
-- Preserve every original task/local check once and dispatch only the exact rule.
DO $$ BEGIN
 IF to_regprocedure('public.commandry_assert_task_proposal_legacy(uuid,uuid)') IS NULL THEN
  ALTER FUNCTION public.commandry_assert_task_proposal(uuid,uuid) RENAME TO commandry_assert_task_proposal_legacy;
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_assert_task_proposal(source_id uuid,initial_work_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.capture_triage_suggestion WHERE capture_id=source_id AND rule_version='agent-finding-proposal/v1') THEN
  PERFORM public.commandry_assert_finding_proposal(source_id,NULL);
 ELSE PERFORM public.commandry_assert_task_proposal_legacy(source_id,initial_work_id);
 END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_task_proposal_integrity_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source_id uuid; old_source_id uuid; initial_id uuid;
BEGIN
 IF TG_TABLE_NAME='capture' THEN source_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSIF TG_TABLE_NAME IN ('work_item','knowledge_item') THEN
  source_id:=CASE WHEN TG_OP='DELETE' THEN OLD.source_capture_id ELSE NEW.source_capture_id END;
  IF TG_OP='UPDATE' THEN old_source_id:=OLD.source_capture_id; END IF;
  IF TG_TABLE_NAME='work_item' AND TG_OP='INSERT' THEN initial_id:=NEW.id; END IF;
  IF TG_TABLE_NAME='knowledge_item' AND TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.capture_triage_suggestion WHERE capture_id=source_id AND rule_version='agent-finding-proposal/v1') THEN
   PERFORM public.commandry_assert_finding_proposal(source_id,NEW.id); RETURN NULL;
  END IF;
 ELSE source_id:=CASE WHEN TG_OP='DELETE' THEN OLD.capture_id ELSE NEW.capture_id END;
 END IF;
 PERFORM public.commandry_assert_task_proposal(source_id,initial_id);
 IF old_source_id IS NOT NULL AND old_source_id IS DISTINCT FROM source_id THEN PERFORM public.commandry_assert_task_proposal(old_source_id,NULL); END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_finding_relation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source_id uuid; parent_tx text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Finding provenance is immutable' USING ERRCODE='23514',CONSTRAINT='foundation_finding_immutable'; END IF;
 IF TG_TABLE_NAME='foundation_finding_citation' THEN
  SELECT capture_id,creation_transaction INTO source_id,parent_tx FROM public.foundation_finding_proposal WHERE proposal_id=NEW.proposal_id AND project_id=NEW.project_id;
  IF parent_tx IS DISTINCT FROM pg_current_xact_id()::text THEN RAISE EXCEPTION 'Finding citations must be created with the proposal' USING ERRCODE='23514',CONSTRAINT='foundation_finding_citation_creation'; END IF;
 ELSE source_id:=NEW.capture_id; NEW.creation_transaction:=pg_current_xact_id()::text;
 END IF;
 PERFORM id FROM public.capture WHERE id=source_id FOR UPDATE;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_finding_relation_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source_id uuid;
BEGIN
 IF TG_TABLE_NAME='foundation_finding_citation' THEN SELECT capture_id INTO source_id FROM public.foundation_finding_proposal WHERE proposal_id=NEW.proposal_id;
 ELSE source_id:=NEW.capture_id;
 END IF;
 PERFORM public.commandry_assert_finding_proposal(source_id,NULL);
 RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['foundation_finding_proposal','foundation_finding_citation','foundation_finding_filing'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||name)::regclass AND tgname=name||'_guard') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.commandry_finding_relation_guard()',name||'_guard',name);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||name)::regclass AND tgname=name||'_integrity') THEN
   EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_finding_relation_integrity()',name||'_integrity',name);
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
-- Mirror existing explicit canonical table DML grants, never role/DDL authority.
DO $$ DECLARE grant_row record; target_name text; BEGIN
 FOR grant_row IN SELECT DISTINCT role.rolname, acl.privilege_type FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl JOIN pg_roles role ON role.oid=acl.grantee
 WHERE ns.nspname='public' AND c.relname='capture_triage_suggestion' AND acl.grantee<>c.relowner AND role.rolname<>current_user AND role.rolname<>session_user AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE') LOOP
  FOREACH target_name IN ARRAY ARRAY['foundation_finding_proposal','foundation_finding_citation','foundation_finding_filing'] LOOP
   EXECUTE format('GRANT %s ON TABLE public.%I TO %I',grant_row.privilege_type,target_name,grant_row.rolname);
  END LOOP;
 END LOOP;
END $$;

--> statement-breakpoint
-- Changes touching an initial assertion must also reach its filing assertion.
CREATE OR REPLACE FUNCTION public.commandry_finding_memory_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source_id uuid; memory_key uuid;
BEGIN
 memory_key:=CASE WHEN TG_OP='DELETE' THEN OLD.memory_id ELSE NEW.memory_id END;
 SELECT capture_id INTO source_id FROM public.foundation_finding_filing WHERE memory_id=memory_key;
 IF source_id IS NOT NULL THEN PERFORM public.commandry_assert_finding_proposal(source_id,NULL); END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['foundation_memory_alias','foundation_memory_relation','foundation_instruction_approval'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||name)::regclass AND tgname='finding_'||name||'_integrity') THEN
   EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_finding_memory_integrity()','finding_'||name||'_integrity',name);
  END IF;
 END LOOP;
END $$;

--> statement-breakpoint
-- An admitting transaction may enforce deferred checks early and then edit a
-- source itself. Revalidate only proposals first created in that transaction.
-- Later ordinary source edits never revisit a previous transaction's proof.
CREATE OR REPLACE FUNCTION public.commandry_finding_initial_source_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source_key text; previous_key text; kind text; proposal_capture uuid;
BEGIN
 IF TG_TABLE_NAME='knowledge_item_revision' THEN
  kind:='knowledge_revision';
  IF TG_OP<>'DELETE' THEN source_key:=NEW.knowledge_item_id::text; END IF;
  IF TG_OP<>'INSERT' THEN previous_key:=OLD.knowledge_item_id::text; END IF;
 ELSE
  kind:=CASE WHEN TG_TABLE_NAME='capture' THEN 'capture' ELSE 'knowledge_revision' END;
  IF TG_OP<>'DELETE' THEN source_key:=NEW.id::text; END IF;
  IF TG_OP<>'INSERT' THEN previous_key:=OLD.id::text; END IF;
 END IF;
 FOR proposal_capture IN
  SELECT DISTINCT p.capture_id FROM public.foundation_finding_proposal p
  JOIN public.foundation_finding_citation fc ON fc.proposal_id=p.proposal_id AND fc.project_id=p.project_id
  JOIN public.foundation_evidence e ON e.id=fc.evidence_id AND e.project_id=p.project_id
  WHERE p.creation_transaction=pg_current_xact_id()::text AND e.source_kind=kind
    AND (e.source_id=source_key OR e.source_id=previous_key)
 LOOP
  PERFORM public.commandry_assert_finding_proposal(proposal_capture,NULL);
 END LOOP;
 RETURN NULL;
END $$;
--> statement-breakpoint
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['capture','knowledge_item','knowledge_item_revision'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||name)::regclass AND tgname='finding_initial_'||name||'_integrity') THEN
   EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_finding_initial_source_integrity()','finding_initial_'||name||'_integrity',name);
  END IF;
 END LOOP;
END $$;
