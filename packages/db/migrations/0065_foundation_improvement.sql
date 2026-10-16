-- This migration is repeatable for disposable bootstrap and journal registration.
-- Canonical JSON matches the domain encoder for finite safe integers. Feature
-- DTOs contain no floating point fields; rejecting them avoids lossy hashing.
CREATE OR REPLACE FUNCTION public.commandry_improvement_utf16_key(value text) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE result bytea := ''::bytea; point integer; i integer;
BEGIN
  FOR i IN 1..length(value) LOOP
    point := ascii(substr(value, i, 1));
    IF point > 65535 THEN
      result := result || decode(lpad(to_hex(55296 + (point - 65536) / 1024),4,'0') || lpad(to_hex(56320 + (point - 65536) % 1024),4,'0'),'hex');
    ELSE result := result || decode(lpad(to_hex(point),4,'0'),'hex'); END IF;
  END LOOP;
  RETURN result;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_canonical_json(value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE result text; number numeric;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'null' THEN RETURN 'null';
    WHEN 'boolean' THEN RETURN value::text;
    WHEN 'string' THEN RETURN value::text;
    WHEN 'number' THEN
      number := value::text::numeric;
      IF number <> trunc(number) OR abs(number) > 9007199254740991 THEN
        RAISE EXCEPTION 'Unsupported canonical JSON number' USING ERRCODE='23514';
      END IF;
      RETURN trunc(number)::text;
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(public.commandry_improvement_canonical_json(element), ',' ORDER BY ordinal), '') || ']'
        INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS a(element, ordinal);
      RETURN result;
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || public.commandry_improvement_canonical_json(element), ',' ORDER BY public.commandry_improvement_utf16_key(key)), '') || '}'
        INTO result FROM jsonb_each(value) AS o(key, element);
      RETURN result;
    ELSE RAISE EXCEPTION 'Unsupported canonical JSON' USING ERRCODE='23514';
  END CASE;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_digest(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT encode(sha256(convert_to(public.commandry_improvement_canonical_json(value),'UTF8')),'hex')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_instant_compare(a text, b text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE a_second timestamptz; b_second timestamptz; a_tail text; b_tail text; width integer;
BEGIN
  IF a !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
     OR b !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'Invalid improvement instant' USING ERRCODE='23514';
  END IF;
  a_second := regexp_replace(a,'\.[0-9]+(Z|[+-][0-9]{2}:[0-9]{2})$','\1')::timestamptz;
  b_second := regexp_replace(b,'\.[0-9]+(Z|[+-][0-9]{2}:[0-9]{2})$','\1')::timestamptz;
  IF a_second < b_second THEN RETURN -1; ELSIF a_second > b_second THEN RETURN 1; END IF;
  a_tail := coalesce(substring(a from '\.([0-9]+)'), '');
  b_tail := coalesce(substring(b from '\.([0-9]+)'), '');
  width := greatest(length(a_tail),length(b_tail));
  a_tail := rpad(a_tail,width,'0'); b_tail := rpad(b_tail,width,'0');
  IF a_tail COLLATE "C" < b_tail COLLATE "C" THEN RETURN -1;
  ELSIF a_tail COLLATE "C" > b_tail COLLATE "C" THEN RETURN 1; END IF;
  RETURN 0;
END $$;
--> statement-breakpoint
-- ECMAScript WhiteSpace and LineTerminator, exactly String.prototype.trim.
CREATE OR REPLACE FUNCTION public.commandry_improvement_text_valid(value jsonb, maximum integer) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT (jsonb_typeof(value) = 'string' AND length(btrim(value #>> '{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
    AND octet_length(public.commandry_improvement_utf16_key(value #>> '{}')) / 2 <= maximum) IS TRUE
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_proposal_valid(r jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE c jsonb; m jsonb; ids jsonb; baseline jsonb; candidate jsonb;
  keys text[] := ARRAY['candidateConfigurationId','baselineConfigurationId','definitionId','motivations','conditionConfigurations','judgeConfigurationIds','rationale','hypothesis','projectId','schemaVersion','id','version','environment','recordedBy','recordedAt','contentDigest'];
BEGIN
  IF NOT (jsonb_typeof(r)='object' AND r ?& keys AND r - keys = '{}'::jsonb
    AND r->'schemaVersion'='1'::jsonb AND r->'version'='1'::jsonb
    AND r->>'candidateConfigurationId' <> r->>'baselineConfigurationId'
    AND jsonb_typeof(r->'conditionConfigurations')='array' AND jsonb_array_length(r->'conditionConfigurations')=2
    AND jsonb_typeof(r->'motivations')='array' AND jsonb_array_length(r->'motivations') BETWEEN 1 AND 100
    AND jsonb_typeof(r->'judgeConfigurationIds')='array' AND jsonb_array_length(r->'judgeConfigurationIds') BETWEEN 1 AND 100
    AND public.commandry_improvement_text_valid(r->'rationale',4000)
    AND public.commandry_improvement_text_valid(r->'hypothesis',4000)
    AND public.commandry_improvement_text_valid(r->'environment',100)
    AND r->>'environment' IN ('local','test','preview','production')
    AND public.commandry_improvement_text_valid(r->'recordedBy',500)
    AND r->>'recordedBy' ~ '^foundation-client:[^[:space:]]+$'
    AND r->>'contentDigest' ~ '^[a-f0-9]{64}$'
    AND r->>'contentDigest' = public.commandry_improvement_digest(r - 'contentDigest')) IS TRUE THEN RETURN false; END IF;
  PERFORM (r->>'id')::uuid, (r->>'projectId')::uuid, (r->>'definitionId')::uuid,
    (r->>'candidateConfigurationId')::uuid, (r->>'baselineConfigurationId')::uuid;
  PERFORM public.commandry_improvement_instant_compare(r->>'recordedAt', r->>'recordedAt');
  FOR c IN SELECT value FROM jsonb_array_elements(r->'conditionConfigurations') LOOP
    IF NOT (jsonb_typeof(c)='object' AND c ?& ARRAY['condition','role','configurationIds']
      AND c - ARRAY['condition','role','configurationIds'] = '{}'::jsonb
      AND public.commandry_improvement_text_valid(c->'condition',200)
      AND c->>'role' IN ('baseline','candidate')
      AND jsonb_typeof(c->'configurationIds')='array' AND jsonb_array_length(c->'configurationIds') BETWEEN 1 AND 100
      AND (SELECT count(DISTINCT value) = count(*) FROM jsonb_array_elements(c->'configurationIds'))) IS TRUE THEN RETURN false; END IF;
    FOR ids IN SELECT value FROM jsonb_array_elements(c->'configurationIds') LOOP
      IF jsonb_typeof(ids) <> 'string' THEN RETURN false; END IF;
      PERFORM (ids #>> '{}')::uuid;
    END LOOP;
    IF c->>'role'='baseline' THEN
      IF baseline IS NOT NULL THEN RETURN false; END IF; baseline := c;
    ELSE IF candidate IS NOT NULL THEN RETURN false; END IF; candidate := c; END IF;
  END LOOP;
  IF NOT (baseline IS NOT NULL AND candidate IS NOT NULL AND baseline->>'condition' <> candidate->>'condition'
    AND baseline->'configurationIds' ? (r->>'baselineConfigurationId') AND NOT baseline->'configurationIds' ? (r->>'candidateConfigurationId')
    AND candidate->'configurationIds' ? (r->>'candidateConfigurationId') AND NOT candidate->'configurationIds' ? (r->>'baselineConfigurationId')
    AND ((baseline->'configurationIds') - (r->>'baselineConfigurationId')) @> ((candidate->'configurationIds') - (r->>'candidateConfigurationId'))
    AND ((baseline->'configurationIds') - (r->>'baselineConfigurationId')) <@ ((candidate->'configurationIds') - (r->>'candidateConfigurationId'))) IS TRUE THEN RETURN false; END IF;
  FOR ids IN SELECT value FROM jsonb_array_elements(r->'judgeConfigurationIds') LOOP
    IF jsonb_typeof(ids) <> 'string' THEN RETURN false; END IF; PERFORM (ids #>> '{}')::uuid;
  END LOOP;
  IF (SELECT count(DISTINCT value) <> count(*) FROM jsonb_array_elements(r->'judgeConfigurationIds')) THEN RETURN false; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(r->'motivations') LOOP
    IF NOT (jsonb_typeof(m)='object' AND m ?& ARRAY['assessmentId','assessmentVersion']
      AND m - ARRAY['assessmentId','assessmentVersion']='{}'::jsonb
      AND jsonb_typeof(m->'assessmentId')='string' AND jsonb_typeof(m->'assessmentVersion')='number'
      AND (m->>'assessmentVersion')::numeric BETWEEN 1 AND 2147483647
      AND (m->>'assessmentVersion')::numeric = trunc((m->>'assessmentVersion')::numeric)) IS TRUE THEN RETURN false; END IF;
    PERFORM (m->>'assessmentId')::uuid;
  END LOOP;
  IF (SELECT count(DISTINCT value->>'assessmentId') <> count(*) FROM jsonb_array_elements(r->'motivations')) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_decision_valid(r jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE keys text[] := ARRAY['projectId','proposalId','expectedProposalDigest','expectedPopulationDigest','expectedReportDigest','expectedDecisionVersion','decision','reason','expiresAt','schemaVersion','id','version','recordedBy','recordedAt','contentDigest'];
BEGIN
  RETURN (jsonb_typeof(r)='object' AND r ?& keys AND r - keys = '{}'::jsonb
    AND r->'schemaVersion'='1'::jsonb AND jsonb_typeof(r->'version')='number'
    AND jsonb_typeof(r->'expectedDecisionVersion')='number'
    AND (r->>'version')::numeric BETWEEN 1 AND 2147483647
    AND (r->>'expectedDecisionVersion')::numeric >= 0
    AND (r->>'version')::numeric = (r->>'expectedDecisionVersion')::numeric + 1
    AND (r->>'version')::numeric = trunc((r->>'version')::numeric)
    AND r->>'decision' IN ('accepted','rejected','revoked')
    AND public.commandry_improvement_text_valid(r->'reason',4000)
    AND public.commandry_improvement_text_valid(r->'recordedBy',500)
    AND r->>'recordedBy' ~ '^user:[^[:space:]]+$'
    AND r->>'expectedProposalDigest' ~ '^[a-f0-9]{64}$'
    AND r->>'expectedPopulationDigest' ~ '^[a-f0-9]{64}$'
    AND r->>'expectedReportDigest' ~ '^[a-f0-9]{64}$'
    AND r->>'contentDigest' ~ '^[a-f0-9]{64}$'
    AND r->>'contentDigest'=public.commandry_improvement_digest(r-'contentDigest')
    AND public.commandry_improvement_instant_compare(r->>'expiresAt',r->>'recordedAt') > 0
    AND (r->>'expiresAt')::timestamptz <= (r->>'recordedAt')::timestamptz + interval '30 days'
    AND (r->>'id')::uuid IS NOT NULL AND (r->>'projectId')::uuid IS NOT NULL AND (r->>'proposalId')::uuid IS NOT NULL) IS TRUE;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_improvement_proposal (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  environment text NOT NULL, definition_id uuid NOT NULL, candidate_configuration_id uuid NOT NULL,
  baseline_configuration_id uuid NOT NULL, record jsonb NOT NULL,
  creation_transaction text NOT NULL DEFAULT pg_current_xact_id()::text,
  CONSTRAINT foundation_improvement_definition_fk FOREIGN KEY (definition_id,project_id) REFERENCES public.foundation_evaluation_definition(id,project_id),
  CONSTRAINT foundation_improvement_candidate_fk FOREIGN KEY (candidate_configuration_id,project_id) REFERENCES public.foundation_configuration(id,project_id),
  CONSTRAINT foundation_improvement_baseline_fk FOREIGN KEY (baseline_configuration_id,project_id) REFERENCES public.foundation_configuration(id,project_id),
  CONSTRAINT foundation_improvement_proposal_record_valid CHECK ((public.commandry_improvement_proposal_valid(record)
    AND record->>'id'=id::text AND record->>'projectId'=project_id::text AND record->>'environment'=environment
    AND record->>'definitionId'=definition_id::text AND record->>'candidateConfigurationId'=candidate_configuration_id::text
    AND record->>'baselineConfigurationId'=baseline_configuration_id::text) IS TRUE)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_proposal_scope_idx ON public.foundation_improvement_proposal(id,project_id,environment);
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_proposal_project_idx ON public.foundation_improvement_proposal(id,project_id);
CREATE INDEX IF NOT EXISTS foundation_improvement_proposal_page_idx ON public.foundation_improvement_proposal(project_id,environment,id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_improvement_condition_configuration (
  proposal_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  condition_ordinal integer NOT NULL, condition text NOT NULL, role text NOT NULL, configuration_id uuid NOT NULL, ordinal integer NOT NULL,
  PRIMARY KEY (proposal_id,condition_ordinal,ordinal),
  CONSTRAINT foundation_improvement_condition_parent_fk FOREIGN KEY (proposal_id,project_id) REFERENCES public.foundation_improvement_proposal(id,project_id),
  CONSTRAINT foundation_improvement_condition_scope_fk FOREIGN KEY (configuration_id,project_id) REFERENCES public.foundation_configuration(id,project_id),
  CONSTRAINT foundation_improvement_condition_order_valid CHECK (condition_ordinal BETWEEN 0 AND 1 AND ordinal >= 0 AND role IN ('baseline','candidate'))
);
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_condition_member_idx ON public.foundation_improvement_condition_configuration(proposal_id,condition,configuration_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_improvement_judge_configuration (
  proposal_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  configuration_id uuid NOT NULL, ordinal integer NOT NULL, PRIMARY KEY (proposal_id,configuration_id),
  CONSTRAINT foundation_improvement_judge_parent_fk FOREIGN KEY (proposal_id,project_id) REFERENCES public.foundation_improvement_proposal(id,project_id),
  CONSTRAINT foundation_improvement_judge_scope_fk FOREIGN KEY (configuration_id,project_id) REFERENCES public.foundation_configuration(id,project_id),
  CONSTRAINT foundation_improvement_judge_order_valid CHECK (ordinal >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_judge_order_idx ON public.foundation_improvement_judge_configuration(proposal_id,ordinal);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_improvement_motivation (
  proposal_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  assessment_id uuid NOT NULL, assessment_version integer NOT NULL, ordinal integer NOT NULL, PRIMARY KEY (proposal_id,assessment_id),
  CONSTRAINT foundation_improvement_motivation_parent_fk FOREIGN KEY (proposal_id,project_id) REFERENCES public.foundation_improvement_proposal(id,project_id),
  CONSTRAINT foundation_improvement_motivation_version_scope_fk FOREIGN KEY (assessment_id,assessment_version,project_id) REFERENCES public.foundation_evaluation_assessment(id,version,project_id),
  CONSTRAINT foundation_improvement_motivation_order_valid CHECK (ordinal >= 0 AND assessment_version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_motivation_order_idx ON public.foundation_improvement_motivation(proposal_id,ordinal);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.foundation_improvement_decision (
  id uuid PRIMARY KEY, proposal_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES public.project(id) ON DELETE RESTRICT,
  environment text NOT NULL, version integer NOT NULL, record jsonb NOT NULL,
  CONSTRAINT foundation_improvement_decision_parent_fk FOREIGN KEY (proposal_id,project_id,environment) REFERENCES public.foundation_improvement_proposal(id,project_id,environment),
  CONSTRAINT foundation_improvement_decision_record_valid CHECK ((public.commandry_improvement_decision_valid(record)
    AND record->>'id'=id::text AND record->>'projectId'=project_id::text AND record->>'proposalId'=proposal_id::text
    AND record->'version'=to_jsonb(version) AND version>0) IS TRUE)
);
CREATE UNIQUE INDEX IF NOT EXISTS foundation_improvement_decision_version_idx ON public.foundation_improvement_decision(proposal_id,version);
CREATE INDEX IF NOT EXISTS foundation_improvement_decision_scope_idx ON public.foundation_improvement_decision(project_id,environment,proposal_id,version);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Improvement history is immutable' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_immutable'; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  NEW.creation_transaction := pg_current_xact_id()::text;
  IF NOT (public.commandry_improvement_instant_compare(NEW.record->>'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) <= 0) IS TRUE THEN
    RAISE EXCEPTION 'Invalid improvement creation time' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_membership_closed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE same_transaction boolean;
BEGIN
  SELECT creation_transaction=pg_current_xact_id()::text INTO same_transaction FROM public.foundation_improvement_proposal
    WHERE id=NEW.proposal_id AND project_id=NEW.project_id;
  IF same_transaction IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Improvement membership is closed' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_membership_closed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_membership_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE parent_id uuid; declared jsonb; observed jsonb; expected jsonb; actual jsonb;
BEGIN
  IF TG_TABLE_NAME='foundation_improvement_proposal' THEN parent_id:=NEW.id; ELSE parent_id:=NEW.proposal_id; END IF;
  SELECT record INTO declared FROM public.foundation_improvement_proposal WHERE id=parent_id AND project_id=NEW.project_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('conditionOrdinal',c.condition_ordinal,'condition',c.condition,'role',c.role,'configurationId',c.configuration_id::text,'ordinal',c.ordinal) ORDER BY c.condition_ordinal,c.ordinal),'[]'::jsonb)
    INTO observed FROM public.foundation_improvement_condition_configuration c WHERE proposal_id=parent_id AND project_id=NEW.project_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('conditionOrdinal',conditions.ordinal-1,'condition',conditions.value->>'condition','role',conditions.value->>'role','configurationId',members.value #>> '{}','ordinal',members.ordinal-1) ORDER BY conditions.ordinal,members.ordinal),'[]'::jsonb)
    INTO expected FROM jsonb_array_elements(declared->'conditionConfigurations') WITH ORDINALITY AS conditions(value,ordinal)
    CROSS JOIN LATERAL jsonb_array_elements(conditions.value->'configurationIds') WITH ORDINALITY AS members(value,ordinal);
  IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Incomplete improvement conditions' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_membership_complete'; END IF;
  SELECT coalesce(jsonb_agg(configuration_id::text ORDER BY ordinal),'[]'::jsonb),coalesce(jsonb_agg(ordinal ORDER BY ordinal),'[]'::jsonb) INTO observed,actual
    FROM public.foundation_improvement_judge_configuration WHERE proposal_id=parent_id AND project_id=NEW.project_id;
  SELECT coalesce(jsonb_agg(ordinal-1 ORDER BY ordinal),'[]'::jsonb) INTO expected FROM jsonb_array_elements(declared->'judgeConfigurationIds') WITH ORDINALITY AS a(value,ordinal);
  IF observed IS DISTINCT FROM declared->'judgeConfigurationIds' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Incomplete improvement judges' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_membership_complete'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('assessmentId',assessment_id::text,'assessmentVersion',assessment_version) ORDER BY ordinal),'[]'::jsonb),coalesce(jsonb_agg(ordinal ORDER BY ordinal),'[]'::jsonb) INTO observed,actual
    FROM public.foundation_improvement_motivation WHERE proposal_id=parent_id AND project_id=NEW.project_id;
  SELECT coalesce(jsonb_agg(ordinal-1 ORDER BY ordinal),'[]'::jsonb) INTO expected FROM jsonb_array_elements(declared->'motivations') WITH ORDINALITY AS a(value,ordinal);
  IF observed IS DISTINCT FROM declared->'motivations' OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Incomplete improvement motivations' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_membership_complete'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_decision_append() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE parent_digest text; current_version integer;
BEGIN
  SELECT record->>'contentDigest' INTO parent_digest FROM public.foundation_improvement_proposal
    WHERE id=NEW.proposal_id AND project_id=NEW.project_id AND environment=NEW.environment FOR UPDATE;
  SELECT coalesce(max(version),0) INTO current_version FROM public.foundation_improvement_decision
    WHERE proposal_id=NEW.proposal_id AND project_id=NEW.project_id AND environment=NEW.environment;
  IF NOT (parent_digest IS NOT NULL AND NEW.record->>'expectedProposalDigest'=parent_digest
    AND current_version<2147483647 AND NEW.version=current_version+1
    AND NEW.record->'expectedDecisionVersion'=to_jsonb(current_version)) IS TRUE THEN
    RAISE EXCEPTION 'Improvement decision version conflict' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_decision_cas';
  END IF;
  IF NOT (public.commandry_improvement_instant_compare(NEW.record->>'recordedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) <= 0) IS TRUE THEN
    RAISE EXCEPTION 'Invalid improvement decision creation time' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.commandry_improvement_decision_deadline() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT (public.commandry_improvement_instant_compare(NEW.record->>'expiresAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) > 0
    AND (NEW.record->>'expiresAt')::timestamptz <= clock_timestamp()+interval '30 days') IS TRUE THEN
    RAISE EXCEPTION 'Improvement decision deadline elapsed' USING ERRCODE='23514', CONSTRAINT='foundation_improvement_decision_deadline';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['foundation_improvement_proposal','foundation_improvement_condition_configuration','foundation_improvement_judge_configuration','foundation_improvement_motivation','foundation_improvement_decision'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS foundation_improvement_immutable ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER foundation_improvement_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_immutable()',table_name);
    IF table_name <> 'foundation_improvement_decision' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS foundation_improvement_membership_complete ON public.%I',table_name);
      EXECUTE format('CREATE CONSTRAINT TRIGGER foundation_improvement_membership_complete AFTER INSERT ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_membership_complete()',table_name);
    END IF;
    IF table_name NOT IN ('foundation_improvement_proposal','foundation_improvement_decision') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS foundation_improvement_membership_closed ON public.%I',table_name);
      EXECUTE format('CREATE TRIGGER foundation_improvement_membership_closed BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_membership_closed()',table_name);
    END IF;
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS foundation_improvement_creation ON public.foundation_improvement_proposal;
CREATE TRIGGER foundation_improvement_creation BEFORE INSERT ON public.foundation_improvement_proposal FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_creation();
DROP TRIGGER IF EXISTS foundation_improvement_decision_append ON public.foundation_improvement_decision;
CREATE TRIGGER foundation_improvement_decision_append BEFORE INSERT ON public.foundation_improvement_decision FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_decision_append();
DROP TRIGGER IF EXISTS foundation_improvement_decision_deadline ON public.foundation_improvement_decision;
CREATE CONSTRAINT TRIGGER foundation_improvement_decision_deadline AFTER INSERT ON public.foundation_improvement_decision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.commandry_improvement_decision_deadline();

--> statement-breakpoint
-- Some supported bootstrap connections are distinct from the role owning
-- default privileges. Preserve the canonical evaluation writer role policy
-- explicitly; this does not grant schema creation or broaden any role's DML.
DO $$
DECLARE permission record; table_name text;
BEGIN
  FOR permission IN
    SELECT DISTINCT grants.grantee, grants.privilege_type
    FROM information_schema.role_table_grants grants
    WHERE grants.table_schema='public' AND grants.table_name='foundation_evaluation_definition'
      AND grants.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
      AND grants.grantee NOT IN ('PUBLIC',current_user)
      AND grants.grantee <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.foundation_evaluation_definition'::regclass)
      AND EXISTS (SELECT 1 FROM information_schema.role_table_grants writers
        WHERE writers.table_schema='public' AND writers.table_name='foundation_evaluation_definition'
          AND writers.grantee=grants.grantee AND writers.privilege_type='INSERT')
  LOOP
    FOREACH table_name IN ARRAY ARRAY['foundation_improvement_proposal','foundation_improvement_condition_configuration','foundation_improvement_judge_configuration','foundation_improvement_motivation','foundation_improvement_decision'] LOOP
      EXECUTE format('GRANT %s ON TABLE public.%I TO %I',permission.privilege_type,table_name,permission.grantee);
    END LOOP;
  END LOOP;
END $$;
