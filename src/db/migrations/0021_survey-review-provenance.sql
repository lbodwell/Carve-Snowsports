ALTER TABLE "survey_responses" ADD COLUMN "link_source" varchar(16) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "candidate_registration_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD COLUMN "review_acknowledgement" jsonb;
--> statement-breakpoint
-- Staff confirmations take precedence over earlier automatic evidence.
UPDATE survey_responses r SET link_source = CASE
  WHEN EXISTS (SELECT 1 FROM audit_events a JOIN surveys s ON s.id = r.survey_id WHERE a.organization_id = s.organization_id AND a.entity_id = r.id AND a.action = 'survey.match_confirmed' AND a.metadata->>'studentId' = r.confirmed_student_id::text) THEN 'staff'
  WHEN EXISTS (SELECT 1 FROM audit_events a JOIN surveys s ON s.id = r.survey_id WHERE a.organization_id = s.organization_id AND a.entity_id = r.id AND a.action = 'submitted' AND a.metadata->>'matchStatus' = 'unique') THEN 'automatic'
  ELSE 'unknown' END
WHERE r.confirmed_student_id IS NOT NULL;
--> statement-breakpoint
-- Until reconciliation assesses enrollment evidence, legacy responses remain visible in review.
UPDATE survey_responses SET enrichment_issues = enrichment_issues || '["Existing response requires enrollment assessment; run Re-link and sync."]'::jsonb WHERE link_source <> 'staff';
--> statement-breakpoint
-- Correct only the obsolete weekday cohort configuration. Existing lesson records are immutable.
UPDATE time_slots SET starts_at = '09:30', ends_at = '11:00', updated_at = now()
WHERE cohort IN ('session-1', 'session-2') AND starts_at = '09:00'
  AND ((allowed_weekdays <> '[]'::jsonb AND allowed_weekdays <@ '[4,5]'::jsonb)
    OR (allowed_weekdays = '[]'::jsonb AND EXISTS (
      SELECT 1 FROM registrations r WHERE r.program_id = time_slots.program_id AND r.archived_at IS NULL
        AND lower(r.source_snapshot->>'weekday') IN ('thursday','friday')
        AND 'session-' || right(replace(r.source_snapshot->>'session', ' ', ''), 1) = time_slots.cohort
    )));
--> statement-breakpoint
-- Imported products explicitly identify the weekday/cohort, never infer one from start time alone.
WITH evidence AS (
 SELECT r.program_id, CASE lower(replace(r.source_snapshot->>'session', ' ', '')) WHEN 'session1' THEN 'session-1' ELSE 'session-2' END AS cohort,
   jsonb_agg(DISTINCT CASE lower(r.source_snapshot->>'weekday') WHEN 'thursday' THEN 4 ELSE 5 END) AS days
 FROM registrations r
 WHERE r.status = 'active' AND r.archived_at IS NULL AND lower(r.source_snapshot->>'weekday') IN ('thursday','friday')
   AND lower(replace(r.source_snapshot->>'session', ' ', '')) IN ('session1','session2')
 GROUP BY r.program_id, 2
)
INSERT INTO time_slots (program_id, key, label, starts_at, ends_at, cohort, allowed_weekdays, display_order)
SELECT e.program_id, e.cohort || '-am', CASE e.cohort WHEN 'session-1' THEN 'Session 1 AM' ELSE 'Session 2 AM' END, '09:30', '11:00', e.cohort, e.days, 5
FROM evidence e WHERE NOT EXISTS (SELECT 1 FROM time_slots s WHERE s.program_id = e.program_id AND s.cohort = e.cohort AND s.active)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH evidence AS (
 SELECT r.program_id, jsonb_agg(DISTINCT CASE lower(r.source_snapshot->>'weekday') WHEN 'saturday' THEN 6 ELSE 0 END) AS days
 FROM registrations r WHERE r.status = 'active' AND r.archived_at IS NULL
   AND lower(r.source_snapshot->>'weekday') IN ('saturday','sunday') AND lower(replace(r.source_snapshot->>'session', ' ', '')) IN ('9am','9:00am')
 GROUP BY r.program_id
)
INSERT INTO time_slots (program_id, key, label, starts_at, ends_at, cohort, allowed_weekdays, display_order)
SELECT e.program_id, 'weekend-advanced-am', 'Ages 11–13 AM', '09:00', '12:00', 'season', e.days, 0
FROM evidence e WHERE NOT EXISTS (SELECT 1 FROM time_slots s WHERE s.program_id = e.program_id AND s.cohort = 'season' AND s.starts_at = '09:00' AND s.ends_at = '12:00' AND s.active)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Add the older children's band only to programs with corresponding registration evidence.
INSERT INTO age_bands (program_id, label, minimum_age, maximum_age, display_order)
SELECT DISTINCT r.program_id, 'Ages 11–13', 11, 13, 3 FROM registrations r
WHERE r.archived_at IS NULL AND r.source_snapshot->>'ageBand' = '11-13yrs'
AND NOT EXISTS (SELECT 1 FROM age_bands b WHERE b.program_id = r.program_id AND b.minimum_age = 11 AND b.maximum_age = 13 AND b.active);

--> statement-breakpoint
-- A pre-existing matching clock must also support the weekdays evidenced by imports.
WITH evidence AS (
 SELECT DISTINCT r.program_id,
   CASE lower(replace(r.source_snapshot->>'session', ' ', '')) WHEN 'session1' THEN 'session-1' WHEN 'session2' THEN 'session-2' ELSE 'season' END AS cohort,
   CASE lower(r.source_snapshot->>'weekday') WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 ELSE 0 END AS day
 FROM registrations r WHERE r.status = 'active' AND r.archived_at IS NULL AND (
   (lower(r.source_snapshot->>'weekday') IN ('thursday','friday') AND lower(replace(r.source_snapshot->>'session', ' ', '')) IN ('session1','session2')) OR
   (lower(r.source_snapshot->>'weekday') IN ('saturday','sunday') AND lower(replace(r.source_snapshot->>'session', ' ', '')) IN ('9am','9:00am')))
), candidates AS (
 SELECT e.*, s.id, count(*) OVER (PARTITION BY e.program_id, e.cohort, e.day) AS matches
 FROM evidence e JOIN time_slots s ON s.program_id = e.program_id AND s.cohort = e.cohort AND s.active
   AND ((e.cohort = 'season' AND s.starts_at = '09:00' AND s.ends_at = '12:00') OR
        (e.cohort <> 'season' AND s.starts_at = '09:30' AND s.ends_at = '11:00'))
), merged AS (
 SELECT s.id, jsonb_agg(DISTINCT d.day ORDER BY d.day) AS days FROM time_slots s
 JOIN (SELECT id, day FROM candidates WHERE matches = 1
       UNION SELECT s.id, value::int FROM time_slots s CROSS JOIN LATERAL jsonb_array_elements_text(s.allowed_weekdays) WHERE s.id IN (SELECT id FROM candidates WHERE matches = 1)) d ON d.id = s.id
 GROUP BY s.id
)
UPDATE time_slots s SET allowed_weekdays = m.days, updated_at = now() FROM merged m WHERE s.id = m.id AND s.allowed_weekdays <> m.days;
