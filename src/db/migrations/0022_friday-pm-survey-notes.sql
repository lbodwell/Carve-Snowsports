ALTER TABLE "survey_responses" ADD COLUMN "note_review" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- Preserve prior review decisions and hide legacy empty survey answers.
UPDATE support_records SET active = false, requires_review = false, updated_at = now()
WHERE source_response_id IS NOT NULL
  AND lower(regexp_replace(trim(restricted_note), '[.![:space:]]+$', '')) IN ('none', 'n/a', 'na', 'not applicable', 'no', 'nil', 'nothing', 'no concerns');
--> statement-breakpoint
UPDATE survey_responses r SET note_review = jsonb_build_object('medical', CASE WHEN s.active THEN 'reviewed' ELSE 'dismissed' END)
FROM support_records s WHERE s.source_response_id = r.id AND (NOT s.active OR NOT s.requires_review);
--> statement-breakpoint
-- Friday PM belongs to the same numbered cohort; inherit its calendar if configured.
INSERT INTO time_slots (program_id, key, label, starts_at, ends_at, cohort, allowed_weekdays, starts_on, ends_on, excluded_dates, display_order)
SELECT p.id, c.cohort || '-pm', c.label, '13:00', '15:00', c.cohort, '[5]'::jsonb,
       a.starts_on, a.ends_on, coalesce(a.excluded_dates, '[]'::jsonb), c.display_order
FROM programs p CROSS JOIN (VALUES ('session-1', 'Session 1 Friday PM', 6), ('session-2', 'Session 2 Friday PM', 7)) c(cohort, label, display_order)
LEFT JOIN LATERAL (SELECT starts_on, ends_on, excluded_dates FROM time_slots WHERE program_id = p.id AND cohort = c.cohort AND active AND starts_at = '09:30' ORDER BY created_at LIMIT 1) a ON true
WHERE NOT EXISTS (SELECT 1 FROM time_slots s WHERE s.program_id = p.id AND s.cohort = c.cohort AND s.active AND s.starts_at = '13:00' AND s.ends_at = '15:00' AND s.allowed_weekdays @> '[5]'::jsonb)
ON CONFLICT DO NOTHING;
