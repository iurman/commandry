ALTER TABLE "capture" DROP CONSTRAINT "capture_source_valid";--> statement-breakpoint
ALTER TABLE "capture" DROP CONSTRAINT "capture_author_valid";--> statement-breakpoint
ALTER TABLE "capture_triage_decision" DROP CONSTRAINT "capture_triage_decision_actor_local";--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" DROP CONSTRAINT "capture_triage_suggestion_confidence_valid";--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" DROP CONSTRAINT "capture_triage_suggestion_rule_v1";--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" DROP CONSTRAINT "capture_triage_suggestion_source_local";--> statement-breakpoint
ALTER TABLE "foundation_client" DROP CONSTRAINT "foundation_client_operations_valid";--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ALTER COLUMN "confidence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD COLUMN "creation_transaction" text DEFAULT pg_current_xact_id()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD COLUMN "provenance" jsonb;--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD COLUMN "proposal" jsonb;--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_source_valid" CHECK ("capture"."source" in ('manual-local', 'automation-local-synthetic', 'foundation-client'));--> statement-breakpoint
ALTER TABLE "capture" ADD CONSTRAINT "capture_author_valid" CHECK (("capture"."source" = 'manual-local' and "capture"."author" = 'local-user') or ("capture"."source" = 'automation-local-synthetic' and "capture"."author" = 'system:local-automation-worker') or ("capture"."source" = 'foundation-client' and "capture"."author" ~ '^foundation-client:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' and length("capture"."author") = 54 and "capture"."input_type" = 'text' and "capture"."project_id" is not null));--> statement-breakpoint
ALTER TABLE "capture_triage_decision" ADD CONSTRAINT "capture_triage_decision_actor_local" CHECK ((("capture_triage_decision"."actor" = 'local-user:unattributed' and "capture_triage_decision"."provenance" is null) or ("capture_triage_decision"."actor" like 'user:%' and length(trim(substring("capture_triage_decision"."actor" from 6))) > 0 and length("capture_triage_decision"."actor") <= 500 and "capture_triage_decision"."provenance" is not null)) is true);--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD CONSTRAINT "capture_triage_suggestion_confidence_valid" CHECK ((("capture_triage_suggestion"."rule_version" = 'capture-triage/v1' and "capture_triage_suggestion"."confidence" between 0 and 100 and "capture_triage_suggestion"."body" is null and "capture_triage_suggestion"."proposal" is null) or ("capture_triage_suggestion"."rule_version" = 'agent-task-proposal/v1' and "capture_triage_suggestion"."confidence" is null and "capture_triage_suggestion"."body" is not null and "capture_triage_suggestion"."proposal" is not null)) is true);--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD CONSTRAINT "capture_triage_suggestion_rule_v1" CHECK ("capture_triage_suggestion"."rule_version" in ('capture-triage/v1', 'agent-task-proposal/v1'));--> statement-breakpoint
ALTER TABLE "capture_triage_suggestion" ADD CONSTRAINT "capture_triage_suggestion_source_local" CHECK ((("capture_triage_suggestion"."rule_version" = 'capture-triage/v1' and "capture_triage_suggestion"."source_label" = 'Local deterministic rule') or ("capture_triage_suggestion"."rule_version" = 'agent-task-proposal/v1' and "capture_triage_suggestion"."source_label" = 'Agent task proposal')) is true);--> statement-breakpoint
ALTER TABLE "foundation_client" ADD CONSTRAINT "foundation_client_operations_valid" CHECK (jsonb_typeof("foundation_client"."operations") = 'array' and jsonb_array_length("foundation_client"."operations") between 1 and 8 and "foundation_client"."operations" <@ '["foundation.read","work.read","work.propose","evidence.record","memory.propose","memory.revise","configuration.record","evaluation.record"]'::jsonb);
--> statement-breakpoint
-- The binding is a closed flat object of strings, two integer version markers
-- and three explicit nulls. Sort its ASCII keys exactly like the application.
CREATE FUNCTION public.commandry_task_proposal_binding_digest(binding jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(convert_to('{' || string_agg(to_jsonb(key)::text || ':' || CASE WHEN key IN ('schemaVersion','proposalVersion') THEN '1' ELSE value::text END, ',' ORDER BY key COLLATE "C") || '}', 'UTF8')), 'hex')
  FROM jsonb_each(binding)
$$;
--> statement-breakpoint
CREATE FUNCTION public.commandry_assert_task_proposal(source_id uuid, initial_work_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  c public.capture%ROWTYPE;
  s public.capture_triage_suggestion%ROWTYPE;
  d public.capture_triage_decision%ROWTYPE;
  w public.work_item%ROWTYPE;
  client public.foundation_client%ROWTYPE;
  b jsonb;
  source_digest text;
  proposal_digest text;
  work_count integer;
BEGIN
  SELECT * INTO c FROM public.capture WHERE id = source_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM public.capture_triage_suggestion WHERE capture_id = c.id;
  SELECT * INTO d FROM public.capture_triage_decision WHERE capture_id = c.id;
  IF c.source <> 'foundation-client' THEN
    IF s.proposal IS NOT NULL OR d.provenance IS NOT NULL THEN
      RAISE EXCEPTION 'Agent proposal provenance requires an actual-client Capture'
        USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_scope';
    END IF;
    RETURN;
  END IF;
  b := s.proposal->'binding';
  IF s.id IS NULL OR s.proposal IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object'
     OR b->>'clientId' IS DISTINCT FROM substring(c.author from 19) THEN
    RAISE EXCEPTION 'Agent proposal binding is unavailable'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_binding';
  END IF;
  SELECT * INTO client FROM public.foundation_client WHERE id::text = b->>'clientId';
  source_digest := encode(sha256(convert_to(c.original_content, 'UTF8')), 'hex');
  proposal_digest := public.commandry_task_proposal_binding_digest(b);
  IF client.id IS NULL OR client.project_id IS DISTINCT FROM c.project_id
     OR (b = jsonb_build_object(
       'schemaVersion', 1, 'proposalId', s.id::text, 'captureId', c.id::text,
       'projectId', c.project_id::text, 'environment', client.environment,
       'clientId', client.id::text, 'principalId', c.author,
       'correlationId', b->>'correlationId', 'submittedAt', b->>'submittedAt',
       'sourceDigest', source_digest, 'proposalVersion', 1,
       'proposedTitle', s.title, 'proposedBody', s.body, 'rationale', s.rationale,
       'runtime', NULL, 'model', NULL, 'runId', NULL
     )) IS DISTINCT FROM TRUE
     OR b->>'correlationId' IS NULL OR length(b->>'correlationId') <> 36
     OR b->>'correlationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
     OR b->>'submittedAt' IS NULL
     OR b->>'submittedAt' IS DISTINCT FROM to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     OR c.created_at IS DISTINCT FROM date_trunc('milliseconds', c.created_at)
     OR (b->>'submittedAt')::timestamptz IS DISTINCT FROM c.created_at
     OR s.created_at IS DISTINCT FROM c.created_at
     OR s.proposed_project_id IS DISTINCT FROM c.project_id
     OR s.kind IS DISTINCT FROM 'task'
     OR s.proposal IS DISTINCT FROM jsonb_build_object('binding',b,'contentDigest',proposal_digest)
     OR s.rule_version IS DISTINCT FROM 'agent-task-proposal/v1'
     OR s.source_label IS DISTINCT FROM 'Agent task proposal'
     OR c.input_type IS DISTINCT FROM 'text'
     OR EXISTS (SELECT 1 FROM public.capture_file WHERE capture_id = c.id)
     OR EXISTS (SELECT 1 FROM public.knowledge_item WHERE source_capture_id = c.id) THEN
    RAISE EXCEPTION 'Agent proposal source and binding disagree'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_binding';
  END IF;
  SELECT count(*) INTO work_count FROM public.work_item WHERE source_capture_id = c.id;
  IF d.id IS NULL THEN
    IF c.state <> 'unfiled' OR work_count <> 0 THEN
      RAISE EXCEPTION 'An agent proposal needs an owner decision before filing'
        USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_owner_decision';
    END IF;
    RETURN;
  END IF;
  IF d.suggestion_id IS DISTINCT FROM s.id
     OR d.actor NOT LIKE 'user:%' OR length(trim(substring(d.actor from 6))) = 0
     OR d.provenance IS DISTINCT FROM jsonb_build_object(
       'schemaVersion',1,'projectId',c.project_id::text,'environment',client.environment,
       'proposalVersion',1,'proposalDigest',proposal_digest,'sourceDigest',source_digest,
       'reviewedBy',d.actor,'correlationId',d.provenance->>'correlationId'
     ) OR d.provenance->>'correlationId' IS NULL
     OR length(d.provenance->>'correlationId') <> 36
     OR d.provenance->>'correlationId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN
    RAISE EXCEPTION 'The owner decision does not match the immutable proposal'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_owner_decision';
  END IF;
  IF d.decision = 'reject' THEN
    IF c.state <> 'unfiled' OR work_count <> 0 THEN
      RAISE EXCEPTION 'A rejected agent proposal cannot be filed'
        USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_rejected';
    END IF;
    RETURN;
  END IF;
  SELECT * INTO w FROM public.work_item WHERE id = d.filed_record_id;
  IF d.decision <> 'approve' OR d.selected_kind IS DISTINCT FROM 'task'
     OR d.selected_project_id IS DISTINCT FROM c.project_id
     OR c.state <> 'filed' OR c.filed_record_kind IS DISTINCT FROM 'task'
     OR c.filed_record_id IS DISTINCT FROM d.filed_record_id
     OR c.filed_at IS DISTINCT FROM d.created_at
     OR work_count <> 1 OR w.id IS NULL OR w.source_capture_id IS DISTINCT FROM c.id
     OR w.project_id IS DISTINCT FROM c.project_id THEN
    RAISE EXCEPTION 'Approved proposal and canonical Work disagree'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_canonical_work';
  END IF;
  -- Verify the initial conversion only. Later ordinary edits must not rewrite
  -- the historical owner selection or receipt, and remain allowed on Work.
  IF (initial_work_id = w.id OR d.creation_transaction = pg_current_xact_id()::text) AND (
     w.title IS DISTINCT FROM d.selected_title OR w.description IS DISTINCT FROM d.selected_body
     OR w.work_type <> 'task' OR w.generated_from_work_item_id IS NOT NULL
     OR w.status <> 'open' OR w.assignee_kind <> 'unassigned'
     OR w.assignee_agent_id IS NOT NULL OR w.assignee_label IS NOT NULL
     OR w.priority IS NOT NULL OR w.due_on IS NOT NULL
     OR w.created_at IS DISTINCT FROM d.created_at OR w.updated_at IS DISTINCT FROM d.created_at
  ) THEN
    RAISE EXCEPTION 'Initial canonical Work differs from the owner selection'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_initial_work';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.commandry_task_proposal_integrity_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE source_id uuid; old_source_id uuid; initial_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'capture' THEN
    source_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME IN ('work_item', 'knowledge_item') THEN
    source_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.source_capture_id ELSE NEW.source_capture_id END;
    IF TG_OP = 'UPDATE' THEN old_source_id := OLD.source_capture_id; END IF;
    IF TG_TABLE_NAME = 'work_item' AND TG_OP = 'INSERT' THEN initial_id := NEW.id; END IF;
  ELSE
    source_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.capture_id ELSE NEW.capture_id END;
  END IF;
  PERFORM public.commandry_assert_task_proposal(source_id, initial_id);
  IF old_source_id IS NOT NULL AND old_source_id IS DISTINCT FROM source_id THEN
    PERFORM public.commandry_assert_task_proposal(old_source_id, NULL);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_capture_integrity AFTER INSERT OR UPDATE ON public.capture
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_suggestion_integrity AFTER INSERT ON public.capture_triage_suggestion
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_decision_integrity AFTER INSERT ON public.capture_triage_decision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_work_integrity AFTER INSERT OR UPDATE OR DELETE ON public.work_item
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_knowledge_integrity AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_item
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER foundation_task_proposal_file_integrity AFTER INSERT ON public.capture_file
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_integrity_trigger();
--> statement-breakpoint
CREATE FUNCTION public.commandry_task_proposal_capture_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'foundation-client' THEN
      RAISE EXCEPTION 'Actual-client Capture scope is immutable'
        USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_capture_scope';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.source = 'foundation-client' AND OLD.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'Actual-client Capture scope is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'foundation_task_proposal_capture_scope';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_capture_scope BEFORE UPDATE OR DELETE ON public.capture
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_capture_scope();
--> statement-breakpoint
-- Every alternate canonical writer serializes on the same actual Capture row.
-- Deferred validation alone would permit concurrent rows to evade each other's
-- visibility, including direct repository/SQL calls outside the proposal facade.
CREATE FUNCTION public.commandry_task_proposal_lock_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE source_id uuid; previous_id uuid;
BEGIN
  IF TG_TABLE_NAME IN ('work_item', 'knowledge_item') THEN
    IF TG_OP <> 'DELETE' THEN source_id := NEW.source_capture_id; END IF;
    IF TG_OP <> 'INSERT' THEN previous_id := OLD.source_capture_id; END IF;
  ELSE
    source_id := NEW.capture_id;
  END IF;
  PERFORM id FROM public.capture
    WHERE source = 'foundation-client' AND (id = source_id OR id = previous_id)
    ORDER BY id FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_work_lock BEFORE INSERT OR UPDATE OR DELETE ON public.work_item
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_lock_source();
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_knowledge_lock BEFORE INSERT OR UPDATE OR DELETE ON public.knowledge_item
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_lock_source();
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_suggestion_lock BEFORE INSERT ON public.capture_triage_suggestion
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_lock_source();
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_decision_lock BEFORE INSERT ON public.capture_triage_decision
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_lock_source();
--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_file_lock BEFORE INSERT ON public.capture_file
FOR EACH ROW EXECUTE FUNCTION public.commandry_task_proposal_lock_source();

--> statement-breakpoint
CREATE TRIGGER foundation_task_proposal_decision_creation_transaction
BEFORE INSERT ON public.capture_triage_decision
FOR EACH ROW EXECUTE FUNCTION public.commandry_foundation_creation_transaction();
