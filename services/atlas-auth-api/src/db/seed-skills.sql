-- Spec 022 v0.3 — seed the skills catalogue with 6 starter skills.
-- Each skill carries real SKILL.md content (instructions_md, when_to_use,
-- examples_md) so it's a capability, not just a listing.
-- Idempotent: ON CONFLICT updates every column, so re-running this on an
-- existing v0.1/v0.2 install backfills the new prose fields.

INSERT INTO skills_catalogue
  (skill_id, version, title, description, category, publisher_name, publisher_verified, kind, manifest, capabilities, pricing_tier_min,
   when_to_use, instructions_md, examples_md)
VALUES
  --------------------------------------------------------------------
  -- Web Research
  --------------------------------------------------------------------
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
    'free',
    $$User asks to research a topic across multiple sources, verify a claim, find citations, or fact-check something. Triggers on "research", "verify", "find sources", "is it true that", "what do the experts say".$$,
    $$# Web Research

## Approach

1. **Decompose** the question into 2-4 focused sub-queries before searching. A vague question gives vague results.
2. **Pull from at least three independent sources** before drafting an answer. One source is a guess; three is research.
3. **Prefer primary sources** — papers, official docs, source code — over secondary aggregators.
4. **Cite inline**. Every non-trivial claim gets a [source] link.
5. When the user asks about a recent event, **weight by date AND credibility**. A 2-day-old Reuters story beats a 6-month-old blog.

## When NOT to use this skill

- Single-fact lookups where one Wikipedia call is enough.
- The user is already an expert and is asking a focused question.
- The question is opinion-based, not fact-based.

## Failure modes to watch for

- **Citation laundering**: Source A cites Source B cites Source C cites Source A. Trace to a primary source.
- **Date staleness**: an authoritative-looking page may be 5 years old.
- **Geographic / language bias**: English-only sources miss local primary sources for non-US topics.

## Output format

For "what is X" with research intent, return:
- 2-3 sentence direct answer
- Bullet-list of supporting facts, each with inline `[source]`
- "Confidence: high/medium/low" line based on source agreement$$,
    $$## Example 1

**User**: "Is it true that GPT-4 has 1.7T parameters?"

**Approach**: Search OpenAI's published docs FIRST. Then peer-reviewed ML literature. Don't take blog speculation as fact.

**Output**:
> OpenAI has never officially disclosed GPT-4's parameter count. The "1.7T" figure originated in a July 2023 SemiAnalysis blog post and has been repeated widely without confirmation. Confidence: low — treat as unverified rumour.

## Example 2

**User**: "Find citations for the claim that exercise reduces depression."

**Approach**: Search PubMed and Cochrane Reviews. Prefer meta-analyses over individual studies. Note effect size, not just direction.

**Output**: list 3-5 meta-analyses with PubMed IDs, year, effect size (Cohen's d), sample size.$$
  ),

  --------------------------------------------------------------------
  -- Code Review
  --------------------------------------------------------------------
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
    'free',
    $$User pastes a diff, a PR URL, or asks "review my code", "what's wrong with this", or "is this safe".$$,
    $$# Code Review

## Approach

1. **Understand the intent first**. Read the PR description / commit message before the code. Critique the implementation against the stated intent.
2. **Three-tier review**:
   - **Correctness** — does it do what the description says?
   - **Safety** — input validation, error handling, race conditions, secrets in logs.
   - **Maintainability** — naming, structure, magic numbers, missing types.
3. **Be specific**. "Refactor this function" is useless. "Pull lines 24-31 into `validateEmail()` so the same logic is reused in `signup()` and `inviteAccept()`" is useful.
4. **Distinguish nits from issues**. Tag every comment with `[nit]`, `[suggest]`, `[issue]`, or `[blocker]`.

## Security flags to ALWAYS check

- SQL string concatenation → injection risk
- Untrusted input rendered without escaping → XSS
- Secrets in code / committed `.env` files
- Permissive CORS (`*` on credentialed endpoints)
- Missing rate limits on auth endpoints
- Race conditions in shared state

## When NOT to use this skill

- The user asked for help WRITING code, not reviewing. Use a code-generation approach instead.
- The diff is one of the user's own published projects — they want validation, not deep critique.

## Output format

```
[blocker] <file>:<line> — <one-line problem>
  why: <one paragraph reasoning>
  fix: <concrete change>

[nit] <file>:<line> — <minor>
```

Sort: blocker → issue → suggest → nit.$$,
    $$## Example

**User**: "Review this: `app.get('/user/:id', (req, res) => { db.query('SELECT * FROM users WHERE id=' + req.params.id, (err, rows) => res.json(rows)); });`"

**Output**:
```
[blocker] inline:1 — SQL injection via req.params.id
  why: req.params.id is user-controlled and concatenated directly into the SQL string.
       An attacker can send /user/1 OR 1=1 and dump the whole users table.
  fix: use a parameterised query: db.query('SELECT * FROM users WHERE id = ?', [req.params.id], ...)

[issue] inline:1 — missing auth check
  why: this endpoint returns user data with no verification that the caller is allowed to.
  fix: add middleware that checks req.session.userId matches req.params.id, or that the
       caller has an admin role.

[suggest] inline:1 — SELECT * leaks columns added later
  fix: enumerate columns: SELECT id, email, display_name FROM users WHERE id = ?
```$$
  ),

  --------------------------------------------------------------------
  -- Support Triage
  --------------------------------------------------------------------
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
    'pro',
    $$User pastes a customer support email/ticket and asks for triage, classification, a draft reply, or routing recommendation.$$,
    $$# Support Triage

## Approach

1. **Classify** the ticket into one of: billing / bug / how-to / feature-request / outage / abuse / other.
2. **Score severity** 1-4:
   - 1 = blocker for a paying customer or many users
   - 2 = significant problem, one customer
   - 3 = minor problem with a workaround
   - 4 = info / how-to / wishlist
3. **Sentiment**: positive / neutral / frustrated / angry. Frustrated + 1-2 = escalate immediately.
4. **Draft a reply** matching tone. Frustrated customers get acknowledgement first, fix second.
5. **Recommend a queue**: tier-1 / billing-team / engineering / abuse-team.

## Tone calibration

- Always lead with empathy when severity ≤ 2 OR sentiment is frustrated/angry.
- Never promise a fix-date you don't control.
- Never blame the customer.
- If you don't know the answer, say "let me check with engineering" — never invent.

## Auto-actions you may suggest (require operator confirm)

- Apply a credit (billing tickets, sev 1-2)
- Open a bug in the issue tracker
- Forward to legal (abuse / threats / GDPR requests)$$,
    $$## Example

**Input**:
> Subject: Atlas crashed AGAIN
> Body: This is the third time this week. I've lost an hour of work. Are you serious about this product or what?

**Output**:
```yaml
classification: bug
severity: 2
sentiment: angry
queue: engineering (with tier-1 acknowledgement first)
suggested_action: open_bug_in_linear

draft_reply: |
  Hi {{name}},

  I'm sorry — losing an hour of work is genuinely frustrating and I understand
  why you're upset. I'm escalating this directly to our engineering team right
  now so we can find the cause.

  To help them debug, could you share:
  - The crash time (rough is fine — we have logs)
  - What you were doing in Atlas when it crashed
  - Your OS version

  In the meantime, your local session history should still be there — happy
  to help recover anything if needed.

  — {{agent_name}}
```$$
  ),

  --------------------------------------------------------------------
  -- Meeting Notes
  --------------------------------------------------------------------
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
    'free',
    $$User shares a meeting recording (audio/video file or URL) or pastes a transcript, and asks for notes, action items, decisions, or a summary.$$,
    $$# Meeting Notes

## Approach

1. **Transcribe** if given audio. Skip if given a transcript already.
2. **Identify speakers** if speaker labels exist; otherwise use "Speaker 1", "Speaker 2".
3. **Extract three things, always in this order**:
   - **Decisions** — what was DECIDED (not just discussed)
   - **Action items** — owner + due date if mentioned
   - **Open questions** — left unresolved
4. **Summary** comes LAST, not first. Decisions and actions matter more.

## Output format

```markdown
# Meeting: {{title or topic}}
**Date**: {{date}}
**Attendees**: {{names}}

## Decisions
- ...

## Action items
- [ ] @owner — task — due date

## Open questions
- ...

## Summary
3-5 sentences max.
```

## Avoid

- Don't quote large transcript chunks back. The user wants the synthesis, not the raw.
- Don't moralise. If the meeting was tense, note it once in Summary, not throughout.
- Don't invent action items the speakers didn't actually agree to.$$,
    $$## Example

**Input**: 45-minute weekly engineering sync transcript.

**Output** (abridged):
```markdown
# Meeting: Engineering weekly
**Date**: 2026-05-30
**Attendees**: Maya, Tom, Priya, Lars

## Decisions
- Postgres 16 upgrade goes ahead next sprint
- We're killing the legacy Redis cluster after the upgrade

## Action items
- [ ] @maya — draft Postgres 16 migration plan — by 2026-06-05
- [ ] @tom — audit any code paths that touch Redis directly — by 2026-06-07
- [ ] @priya — schedule the customer-comms window with support — by 2026-06-10

## Open questions
- Do we need to coordinate with the mobile team?

## Summary
The team committed to the Postgres 16 upgrade and Redis decommission for next sprint.
Maya owns the plan; Tom audits Redis dependencies; Priya handles customer comms.
```$$
  ),

  --------------------------------------------------------------------
  -- Weather (community publisher, less polished SKILL.md)
  --------------------------------------------------------------------
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
    'free',
    $$User asks about weather, temperature, forecast, or "is it going to rain in <city>".$$,
    $$# Weather

## Approach

Use the weather extension to fetch current conditions and 7-day forecast.

Always include:
- Current temp (°C and °F)
- "feels like" if humidity/wind affects perception
- Forecast highs/lows for next 3 days
- Rain probability if asking about outdoor plans

## Defaults

- Units: metric for non-US users, imperial for US.
- Timezone: user's local unless the user named a different city.$$,
    $$## Example

**User**: "Will it rain in Dubai tomorrow?"

**Output**: "Tomorrow in Dubai: high 38°C / 100°F, 0% chance of rain. Sunny and clear. Air quality: moderate."$$
  ),

  --------------------------------------------------------------------
  -- Data Analyst
  --------------------------------------------------------------------
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
    'pro',
    $$User attaches a CSV/Excel/Parquet file or points to one, and asks for analysis, charts, trends, segments, anomalies, or "what does this data show".$$,
    $$# Data Analyst

## Approach

1. **Profile the file first** — shape, dtypes, missing values, summary statistics. Show the user before diving in.
2. **Clarify the question**. "Show me sales" is ambiguous — by what? region, time, product, channel? Ask before computing.
3. **Pick the right chart**:
   - Time series → line
   - Categorical comparison → bar (horizontal if >7 categories)
   - Distribution → histogram or KDE
   - Two numerics → scatter; add trendline if linear-ish
   - Compositions → stacked bar, NOT pie (pies are hard to read past 4 slices)
4. **State limits explicitly**: outliers excluded? Time window? Filter applied?

## Watch out for

- **Misleading axis** — start at zero unless there's a reason not to, and say why.
- **Sample size disclosure** — "30% growth" off n=10 is not the same as n=10,000.
- **Survivorship bias** — if the dataset only contains active customers, churn rate from it is meaningless.
- **Date-format gotchas** — DD/MM/YYYY vs MM/DD/YYYY.

## Output format

For each insight:
- One-sentence finding
- Chart or table backing it
- Confidence + caveat

End with: "Want me to drill into any of these?"$$,
    $$## Example

**User**: attaches sales_2026.csv (5 columns, 12,000 rows) and asks "what's the trend?"

**Output**:
> **File profile**: 12,000 rows, 5 columns (date, region, product, channel, revenue_usd). Date range 2026-01-01 to 2026-05-30. No missing values. 4 regions, 8 products, 3 channels.
>
> **Headline trend**: revenue grew from $1.2M (Jan) to $1.8M (May), +50% over 5 months. Driven mostly by the EMEA region (line chart attached).
>
> **Caveat**: April had only 22 selling days vs March's 23 — adjusting for that, growth Mar→Apr was 6%, not the 4% the raw numbers show.
>
> Want me to drill into product mix, channel mix, or compare to last year?$$
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
      when_to_use       = EXCLUDED.when_to_use,
      instructions_md   = EXCLUDED.instructions_md,
      examples_md       = EXCLUDED.examples_md,
      updated_at        = NOW();

-- Backfill skill_versions for any catalogue row that doesn't yet have
-- a matching history entry. Carries the new SKILL.md prose fields too.
INSERT INTO skill_versions
  (skill_id, version, title, description, category, publisher_name,
   publisher_verified, kind, manifest, capabilities, pricing_tier_min,
   when_to_use, instructions_md, examples_md,
   changelog, published_at)
SELECT c.skill_id, c.version, c.title, c.description, c.category,
       c.publisher_name, c.publisher_verified, c.kind, c.manifest,
       c.capabilities, c.pricing_tier_min,
       c.when_to_use, c.instructions_md, c.examples_md,
       'Initial seed (v0.3 — includes SKILL.md content)', c.created_at
FROM skills_catalogue c
LEFT JOIN skill_versions v ON v.skill_id = c.skill_id AND v.version = c.version
WHERE v.skill_id IS NULL;

-- v0.3 one-time backfill: pre-existing skill_versions rows that were
-- written before the SKILL.md columns existed have NULL prose. Copy the
-- current catalogue row's prose into matching version rows. Idempotent
-- — only fills NULLs, never overwrites.
UPDATE skill_versions v
   SET when_to_use     = COALESCE(v.when_to_use,     c.when_to_use),
       instructions_md = COALESCE(v.instructions_md, c.instructions_md),
       examples_md     = COALESCE(v.examples_md,     c.examples_md)
  FROM skills_catalogue c
 WHERE v.skill_id = c.skill_id
   AND v.version  = c.version
   AND (v.instructions_md IS NULL OR v.when_to_use IS NULL OR v.examples_md IS NULL);
