-- "Add to Pipeline" creates a Firestore property; remember which one so the
-- map can show a candidate is already in the pipeline instead of adding it twice.
alter table freehold_candidates add column if not exists pipeline_property_id text;
alter table freehold_candidates add column if not exists pipeline_added_at timestamptz;
