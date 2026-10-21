-- Backfill existing confirmed links without overwriting roster values or
-- choosing between conflicting survey answers. Each update is audited.
WITH agreed_birthdates AS (
  SELECT p.id AS student_id, min(r.child_date_of_birth) AS date_of_birth
  FROM survey_responses r
  JOIN surveys s ON s.id = r.survey_id
  JOIN people p ON p.id = r.confirmed_student_id
    AND p.organization_id = s.organization_id
  JOIN students st ON st.person_id = p.id
  WHERE p.date_of_birth IS NULL AND p.archived_at IS NULL
  GROUP BY p.id
  HAVING min(r.child_date_of_birth) = max(r.child_date_of_birth)
), filled AS (
  UPDATE people p
  SET date_of_birth = a.date_of_birth, updated_at = now()
  FROM agreed_birthdates a
  WHERE p.id = a.student_id AND p.date_of_birth IS NULL AND p.archived_at IS NULL
  RETURNING p.id, p.organization_id
)
INSERT INTO audit_events (organization_id, actor_id, entity_type, entity_id, action, metadata)
SELECT organization_id, NULL, 'person', id, 'survey.birthdate_filled',
  jsonb_build_object('source', 'confirmed_survey_backfill')
FROM filled;
