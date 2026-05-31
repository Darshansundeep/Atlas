-- Spec 022 v0.1 — seed the skills catalogue with 6 starter skills so
-- the Skills tab has something to render on day one. Idempotent.

INSERT INTO skills_catalogue
  (skill_id, version, title, description, category, publisher_name, publisher_verified, kind, manifest, capabilities, pricing_tier_min)
VALUES
  (
    'ai.netgroup.atlas.web-research',
    '1.0.0',
    'Web Research',
    'Multi-source web search with citation extraction. Pulls from Brave Search, Wikipedia, and arXiv; synthesises a cited summary.',
    'research',
    'NET Group',
    TRUE,
    'composite',
    '{"extensions":[{"ref":"@atlas/extension-fetch","config":{}}],"capabilities":{"network":["https://*"],"models":["anthropic/*","openai/*","google/*"]}}'::jsonb,
    '["web_access","summarisation"]'::jsonb,
    'free'
  ),
  (
    'ai.netgroup.atlas.code-review',
    '0.9.1',
    'Code Review',
    'Reads a diff or a PR URL, flags potential bugs, style issues, and security concerns.',
    'code',
    'NET Group',
    TRUE,
    'composite',
    '{"extensions":[{"ref":"@atlas/extension-git","config":{}}],"capabilities":{"filesystem":"read-only","models":["anthropic/*","openai/*"]}}'::jsonb,
    '["code_analysis","security"]'::jsonb,
    'free'
  ),
  (
    'ai.netgroup.atlas.support-triage',
    '1.2.0',
    'Support Triage',
    'Classifies inbound customer support tickets, suggests responses, and routes to the right queue.',
    'customer-support',
    'NET Group',
    TRUE,
    'recipe',
    '{"recipe":{"name":"support-triage","instructions":"You are a support triage assistant..."}}'::jsonb,
    '["text_classification","drafting"]'::jsonb,
    'pro'
  ),
  (
    'ai.netgroup.atlas.meeting-notes',
    '0.5.0',
    'Meeting Notes',
    'Transcribes a meeting recording and produces structured notes with action items and decisions.',
    'productivity',
    'NET Group',
    TRUE,
    'composite',
    '{"extensions":[{"ref":"@atlas/extension-transcribe","config":{}}],"capabilities":{"filesystem":"read-only","network":["https://*"]}}'::jsonb,
    '["transcription","summarisation"]'::jsonb,
    'free'
  ),
  (
    'com.example.weather-bot',
    '2.1.0',
    'Weather',
    'Lookup current conditions and forecasts for any city. Powered by Open-Meteo (free, no API key).',
    'utility',
    'Open Source Community',
    FALSE,
    'extension',
    '{"extensions":[{"ref":"@example/extension-weather","config":{"provider":"open-meteo"}}],"capabilities":{"network":["https://api.open-meteo.com"]}}'::jsonb,
    '["weather"]'::jsonb,
    'free'
  ),
  (
    'ai.netgroup.atlas.data-analyst',
    '1.0.0',
    'Data Analyst',
    'Read CSV/Parquet files, run analyses, generate charts. Pairs well with the file-attachment chips.',
    'data',
    'NET Group',
    TRUE,
    'composite',
    '{"extensions":[{"ref":"@atlas/extension-pandas","config":{}}],"capabilities":{"filesystem":"read-only","models":["anthropic/*"]}}'::jsonb,
    '["data_analysis","charting"]'::jsonb,
    'pro'
  )
ON CONFLICT (skill_id) DO UPDATE
  SET version           = EXCLUDED.version,
      title             = EXCLUDED.title,
      description       = EXCLUDED.description,
      category          = EXCLUDED.category,
      publisher_name    = EXCLUDED.publisher_name,
      publisher_verified= EXCLUDED.publisher_verified,
      kind              = EXCLUDED.kind,
      manifest          = EXCLUDED.manifest,
      capabilities      = EXCLUDED.capabilities,
      pricing_tier_min  = EXCLUDED.pricing_tier_min,
      updated_at        = NOW();
