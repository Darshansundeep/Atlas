-- Spec 011 — seed the model catalogue with the major frontier and budget
-- models as of 2026-05. Prices in USD per 1M tokens. Re-runnable
-- (ON CONFLICT updates everything except provider/model).

INSERT INTO model_catalogue
  (provider, model, display_name, input_per_million, output_per_million, context_window, capabilities, notes)
VALUES
  -- Anthropic
  ('anthropic', 'claude-opus-4-5',          'Claude Opus 4.5',     15.00,  75.00,  200000, '["reasoning","tools","vision","cache"]',  'frontier reasoning, 1M-context variant available'),
  ('anthropic', 'claude-sonnet-4-6',        'Claude Sonnet 4.6',    3.00,  15.00,  200000, '["reasoning","tools","vision","cache"]',  'balanced default'),
  ('anthropic', 'claude-haiku-4-5',         'Claude Haiku 4.5',     0.80,   4.00,  200000, '["tools","vision","cache"]',              'fast/cheap'),

  -- OpenAI
  ('openai',    'gpt-4o',                   'GPT-4o',               2.50,  10.00,  128000, '["reasoning","tools","vision","cache"]',  ''),
  ('openai',    'gpt-4o-mini',              'GPT-4o mini',          0.15,   0.60,  128000, '["tools","vision"]',                      ''),
  ('openai',    'o3',                       'OpenAI o3',           15.00,  60.00,  200000, '["reasoning","tools"]',                   'reasoning'),
  ('openai',    'o4-mini',                  'OpenAI o4-mini',       1.10,   4.40,  200000, '["reasoning","tools"]',                   'reasoning, cheap'),

  -- Google
  ('google',    'gemini-2.5-pro',           'Gemini 2.5 Pro',       1.25,  10.00, 1000000, '["reasoning","tools","vision"]',          'huge context'),
  ('google',    'gemini-2.5-flash',         'Gemini 2.5 Flash',     0.30,   2.50,  1000000,'["tools","vision"]',                      ''),

  -- xAI
  ('xai',       'grok-4',                   'Grok 4',               5.00,  15.00,  256000, '["reasoning","tools","vision"]',          ''),

  -- Meta
  ('meta',      'llama-4-maverick',         'Llama 4 Maverick',     0.50,   1.50,  128000, '["tools","vision"]',                      ''),

  -- DeepSeek
  ('deepseek',  'deepseek-r1',              'DeepSeek R1',          0.55,   2.19,  128000, '["reasoning","tools"]',                   'open weights'),
  ('deepseek',  'deepseek-v3',              'DeepSeek V3',          0.27,   1.10,  128000, '["tools"]',                               ''),

  -- Mistral
  ('mistral',   'mistral-large-2',          'Mistral Large 2',      2.00,   6.00,  128000, '["tools"]',                               ''),

  -- Cohere
  ('cohere',    'command-r-plus',           'Command R+',           2.50,  10.00,  128000, '["tools"]',                               ''),

  -- Local
  ('ollama',    'llama3.3',                 'Llama 3.3 (local)',    0.00,   0.00,  128000, '["tools"]',                               'free; user runs locally'),
  ('ollama',    'mistral-nemo',             'Mistral Nemo (local)', 0.00,   0.00,  128000, '["tools"]',                               'free; user runs locally')
ON CONFLICT (provider, model) DO UPDATE
  SET display_name      = EXCLUDED.display_name,
      input_per_million  = EXCLUDED.input_per_million,
      output_per_million = EXCLUDED.output_per_million,
      context_window     = EXCLUDED.context_window,
      capabilities       = EXCLUDED.capabilities,
      notes              = EXCLUDED.notes,
      updated_at         = NOW();
