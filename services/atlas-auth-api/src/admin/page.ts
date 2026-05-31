/**
 * Atlas admin panel — single-page HTML. Inline CSS + vanilla JS. No build step.
 *
 * Brand language matches the desktop app: midnight + amber palette, Inter
 * stack, soft cards, gradient accents. Designed for an audience of one
 * (the operator) — readable on first load, no marketing fluff.
 *
 * Auth: every fetch the page makes sends `Authorization: Bearer <token>`
 * where the token comes from the `?token=` query param on the URL. If no
 * token is provided the page shows a "Paste admin token" gate.
 */

export function adminHtml(): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Atlas Admin</title>
<style>
  :root {
    --ink: #0f1729;
    --ink-soft: #5b6478;
    --ink-mute: #9098a8;
    --paper: #fafaf7;
    --paper-soft: #f1efe6;
    --hairline: #ebe9e0;
    --hairline-2: #dad7cc;
    --cobalt: #1e2a55;
    --cobalt-2: #3b4d8f;
    --amber: #d4a44a;
    --amber-soft: rgba(212, 164, 74, 0.16);
    --danger: #c8474b;
    --success: #5e8a52;
    --shadow-md:
      0 4px 12px -2px rgba(15, 23, 41, 0.06),
      0 2px 4px -2px rgba(15, 23, 41, 0.04);
    --shadow-lg:
      0 18px 38px -12px rgba(15, 23, 41, 0.10),
      0 6px 16px -6px rgba(15, 23, 41, 0.06);
    --hero:
      radial-gradient(60% 70% at 50% 0%, rgba(30, 42, 85, 0.06), transparent 60%),
      linear-gradient(180deg, #fafaf7 0%, #f1efe6 100%);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: var(--hero);
    color: var(--ink);
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display',
                 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
    letter-spacing: -0.005em;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--cobalt); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, pre, .mono { font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace; }

  header.bar {
    position: sticky; top: 0; z-index: 5;
    backdrop-filter: blur(12px);
    background: rgba(250, 250, 247, 0.85);
    border-bottom: 1px solid var(--hairline);
    padding: 14px 28px;
    display: flex; align-items: center; gap: 14px;
  }
  .brand {
    display: inline-flex; align-items: center; gap: 9px;
    font-weight: 600; letter-spacing: -0.01em;
  }
  .brand svg { display: block; }
  .brand-tag {
    margin-left: 10px;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--amber);
    background: var(--amber-soft);
    padding: 2px 7px; border-radius: 999px;
    font-weight: 600;
  }
  header .spacer { flex: 1; }
  header .status {
    font-size: 12px; color: var(--ink-soft);
    display: inline-flex; align-items: center; gap: 6px;
  }
  header .status::before {
    content: ''; width: 7px; height: 7px; border-radius: 999px;
    background: var(--success);
    box-shadow: 0 0 6px rgba(94, 138, 82, 0.5);
  }

  nav.tabs {
    display: flex; gap: 4px;
    border-bottom: 1px solid var(--hairline);
    padding: 0 28px;
    background: rgba(250, 250, 247, 0.6);
    position: sticky; top: 56px; z-index: 4;
  }
  nav.tabs button {
    background: transparent; border: 0; cursor: pointer;
    padding: 12px 14px;
    font: inherit; font-weight: 500;
    color: var(--ink-soft);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  nav.tabs button.active {
    color: var(--ink);
    border-bottom-color: var(--cobalt);
  }
  nav.tabs button.coming-soon { color: var(--ink-mute); cursor: default; }

  main { padding: 28px; max-width: 1280px; margin: 0 auto; }
  section.page { display: none; }
  section.page.active { display: block; animation: fade 200ms ease-out; }
  @keyframes fade {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: none; }
  }

  /* Stat cards */
  .stats { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .stat-card {
    background: #fff;
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 18px 18px 16px;
    box-shadow: var(--shadow-md);
    position: relative;
    overflow: hidden;
  }
  .stat-card::after {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(80% 60% at 50% 0%, rgba(212, 164, 74, 0.06), transparent 70%);
    pointer-events: none;
  }
  .stat-card .label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--ink-soft); font-weight: 600;
  }
  .stat-card .value {
    font-size: 30px; font-weight: 600; letter-spacing: -0.02em;
    margin-top: 6px; color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .stat-card.alert .value { color: var(--danger); }

  /* Tables */
  .panel {
    background: #fff;
    border: 1px solid var(--hairline);
    border-radius: 14px;
    padding: 6px;
    box-shadow: var(--shadow-md);
    margin-top: 18px;
    overflow: hidden;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px 6px;
  }
  .panel-header h2 {
    margin: 0; font-size: 14px; font-weight: 600;
    letter-spacing: -0.01em;
  }
  .panel-header .hint {
    font-size: 11px; color: var(--ink-soft);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  thead th {
    text-align: left; padding: 10px 14px;
    font-size: 11px; font-weight: 600;
    color: var(--ink-soft);
    text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 1px solid var(--hairline);
  }
  tbody td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: rgba(212, 164, 74, 0.04); }
  td.mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-soft); }
  td.email { font-weight: 500; }

  .pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    background: var(--paper-soft);
    color: var(--ink-soft);
  }
  .pill.pro     { background: var(--amber-soft); color: var(--amber); }
  .pill.team    { background: rgba(30, 42, 85, 0.10); color: var(--cobalt); }
  .pill.enterprise { background: rgba(94, 138, 82, 0.14); color: var(--success); }
  .pill.danger  { background: rgba(200, 71, 75, 0.10); color: var(--danger); }
  .pill.success { background: rgba(94, 138, 82, 0.10); color: var(--success); }
  .pill.warn    { background: var(--amber-soft); color: var(--amber); }

  button.action {
    background: transparent;
    border: 1px solid var(--hairline-2);
    color: var(--ink);
    padding: 4px 10px;
    border-radius: 7px;
    font: inherit; font-size: 12px; font-weight: 500;
    cursor: pointer;
  }
  button.action:hover { border-color: var(--cobalt); color: var(--cobalt); }
  button.action.danger:hover { border-color: var(--danger); color: var(--danger); }

  .empty {
    padding: 36px;
    text-align: center;
    color: var(--ink-mute);
    font-size: 13px;
  }

  .coming-soon-card {
    background: #fff;
    border: 1px solid var(--hairline);
    border-radius: 14px;
    padding: 36px;
    text-align: center;
    box-shadow: var(--shadow-md);
  }
  .coming-soon-card h3 { margin: 0 0 6px; font-size: 16px; }
  .coming-soon-card p  { margin: 0; color: var(--ink-soft); font-size: 13px; max-width: 44ch; margin: 0 auto; }

  /* Gate */
  .gate {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(60% 40% at 50% -10%, rgba(212, 164, 74, 0.18), transparent 70%),
      linear-gradient(135deg, #0f1729 0%, #1e2a55 38%, #3b4d8f 70%, #d4a44a 110%);
    color: #fafaf7;
  }
  .gate-card {
    background: rgba(255, 255, 255, 0.96);
    color: var(--ink);
    padding: 32px;
    border-radius: 16px;
    width: min(440px, 90vw);
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(12px);
  }
  .gate-card h1 { margin: 0 0 6px; font-size: 18px; }
  .gate-card p  { margin: 0 0 16px; color: var(--ink-soft); font-size: 13px; }
  .gate-card input {
    width: 100%; padding: 10px 12px;
    border: 1px solid var(--hairline-2); border-radius: 8px;
    font: inherit; font-family: 'JetBrains Mono', monospace; font-size: 13px;
  }
  .gate-card button {
    margin-top: 12px; width: 100%;
    background: linear-gradient(135deg, #0f1729, #1e2a55);
    color: #fafaf7;
    border: 0; padding: 10px;
    border-radius: 8px; font: inherit; font-weight: 500; font-size: 14px;
    cursor: pointer;
    box-shadow: 0 6px 18px -6px rgba(15, 23, 41, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .toast {
    position: fixed; bottom: 22px; right: 22px;
    padding: 10px 14px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid var(--hairline);
    box-shadow: var(--shadow-lg);
    font-size: 13px; color: var(--ink);
    transform: translateY(20px); opacity: 0;
    transition: all 200ms ease-out;
    pointer-events: none;
  }
  .toast.show { transform: none; opacity: 1; pointer-events: auto; }
  .toast.error { border-color: var(--danger); color: var(--danger); }
</style>
</head>
<body>
  <!-- Token gate (rendered first; replaced by main app once token validated) -->
  <div id="gate" class="gate">
    <form id="gate-form" class="gate-card">
      <h1>Atlas Admin</h1>
      <p>Paste your <code>ADMIN_TOKEN</code> to continue. Get this from the operator running the auth backend.</p>
      <input id="gate-token" type="password" placeholder="admin token" autocomplete="off" autofocus />
      <button type="submit">Continue</button>
      <p id="gate-err" style="color: var(--danger); display: none; margin-top: 10px;"></p>
    </form>
  </div>

  <!-- Main app — hidden until token validates -->
  <div id="app" style="display:none">
    <header class="bar">
      <span class="brand">
        <svg width="22" height="22" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="4" y1="4" x2="28" y2="28">
              <stop offset="0%" stop-color="#1e2a55" />
              <stop offset="100%" stop-color="#1e2a55" stop-opacity="0.78" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="17" r="11" fill="url(#g1)" />
          <ellipse cx="16" cy="17" rx="11" ry="5" stroke="rgba(255,255,255,0.32)" fill="none" />
          <ellipse cx="16" cy="17" rx="5" ry="11" stroke="rgba(255,255,255,0.28)" fill="none" />
          <path d="M24 6.5 L25 9 L27.5 10 L25 11 L24 13.5 L23 11 L20.5 10 L23 9 Z" fill="#d4a44a" />
        </svg>
        Atlas
        <span class="brand-tag">Admin</span>
      </span>
      <span class="spacer"></span>
      <span class="status" id="status-pill">backend live</span>
    </header>
    <nav class="tabs" id="tabs">
      <button data-page="overview" class="active">Overview</button>
      <button data-page="people">People</button>
      <button data-page="sessions">Sessions</button>
      <button data-page="audit">Audit</button>
      <button data-page="models">Models</button>
      <button data-page="skills">Skills</button>
    </nav>

    <main>
      <section class="page active" id="page-overview">
        <div class="stats" id="stat-grid"></div>
        <div class="panel">
          <div class="panel-header">
            <h2>Recent activity</h2>
            <span class="hint">last 10 audit events</span>
          </div>
          <div id="recent-audit"></div>
        </div>
      </section>

      <section class="page" id="page-people">
        <div class="panel">
          <div class="panel-header">
            <h2>People</h2>
            <span class="hint" id="people-count"></span>
          </div>
          <div id="people-table"></div>
        </div>
      </section>

      <section class="page" id="page-sessions">
        <div class="panel">
          <div class="panel-header">
            <h2>Active sessions</h2>
            <span class="hint">refresh tokens not revoked and not expired</span>
          </div>
          <div id="sessions-table"></div>
        </div>
      </section>

      <section class="page" id="page-audit">
        <div class="panel">
          <div class="panel-header">
            <h2>Audit log</h2>
            <span class="hint">last 200 events, newest first</span>
          </div>
          <div id="audit-table"></div>
        </div>
      </section>

      <section class="page" id="page-models">
        <div class="panel">
          <div class="panel-header">
            <h2>Model catalogue</h2>
            <span class="hint">canonical (provider, model) pricing — USD per 1M tokens</span>
          </div>
          <div id="catalogue-table"></div>
        </div>

        <div class="panel" style="margin-top: 18px;">
          <div class="panel-header">
            <h2>Add or update a model</h2>
            <span class="hint">upsert by (provider, model)</span>
          </div>
          <form id="catalogue-form" style="padding: 0 16px 16px; display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Provider
              <input name="provider" required placeholder="anthropic" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Model
              <input name="model" required placeholder="claude-sonnet-4-6" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;font-family:'JetBrains Mono',monospace;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Display name
              <input name="display_name" placeholder="(optional)" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Input / 1M
              <input name="input_per_million" type="number" min="0" step="0.01" placeholder="3.00" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Output / 1M
              <input name="output_per_million" type="number" min="0" step="0.01" placeholder="15.00" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Context
              <input name="context_window" type="number" min="0" placeholder="200000" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <div style="grid-column: 1 / -1;">
              <button type="submit" style="background:linear-gradient(135deg,#0f1729,#1e2a55);color:#fafaf7;border:0;padding:8px 14px;border-radius:7px;font:inherit;font-weight:500;font-size:13px;cursor:pointer;">
                Save model
              </button>
            </div>
          </form>
        </div>
      </section>

      <section class="page" id="page-skills">
        <div class="panel">
          <div class="panel-header">
            <h2>Skills catalogue</h2>
            <span class="hint">spec 022 v0.2 — versioned, editable</span>
          </div>
          <div id="skills-table"></div>
        </div>

        <div class="panel" style="margin-top: 18px;">
          <div class="panel-header">
            <h2 id="skills-form-title">Publish a new skill</h2>
            <span class="hint" id="skills-form-hint">first publish creates the catalogue row</span>
          </div>
          <form id="skills-form" style="padding: 0 16px 16px; display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
            <!-- Mode flag: 'publish' (new version) or 'save' (in-place edit). Set by Edit / Cancel. -->
            <input type="hidden" name="mode" value="publish" id="skills-form-mode" />
            <input type="hidden" name="original_skill_id" id="skills-form-original-id" value="" />

            <label style="grid-column: 1 / -1; font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Skill ID (reverse-DNS)
              <input name="skill_id" required placeholder="ai.netgroup.atlas.example" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-family:'JetBrains Mono',monospace;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Version
              <input name="version" required placeholder="1.0.0" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Kind
              <select name="kind" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;">
                <option value="extension">Extension (MCP)</option>
                <option value="recipe">Recipe</option>
                <option value="composite" selected>Composite</option>
              </select>
            </label>
            <label style="grid-column: 1 / -1; font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Title
              <input name="title" required placeholder="Web Research" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="grid-column: 1 / -1; font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Description
              <textarea name="description" rows="2" placeholder="One-sentence pitch shown in the marketplace." style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;resize:vertical;"></textarea>
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Category
              <input name="category" placeholder="general" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Publisher
              <input name="publisher_name" placeholder="NET Group" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;" />
            </label>
            <label style="font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Tier min
              <select name="pricing_tier_min" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;">
                <option value="free" selected>Free</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label style="grid-column: 1 / -1; font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Manifest (JSON)
              <textarea name="manifest" rows="4" placeholder='{"extensions":[],"capabilities":{}}' style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-family:'JetBrains Mono',monospace;font-size:12px;margin-top:4px;resize:vertical;">{}</textarea>
            </label>
            <label id="skills-form-changelog-wrap" style="grid-column: 1 / -1; font-size:11px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.06em;">
              Changelog (this version's notes)
              <textarea name="changelog" rows="2" placeholder="Bumped extension to ^3.0; added arXiv source" style="width:100%;padding:6px 8px;border:1px solid var(--hairline-2);border-radius:6px;font:inherit;font-size:13px;margin-top:4px;resize:vertical;"></textarea>
            </label>
            <div style="grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <button type="submit" id="skills-form-submit" style="background:linear-gradient(135deg,#0f1729,#1e2a55);color:#fafaf7;border:0;padding:8px 14px;border-radius:7px;font:inherit;font-weight:500;font-size:13px;cursor:pointer;">
                Publish new version
              </button>
              <button type="button" id="skills-form-save-inplace" style="display:none;background:transparent;border:1px solid var(--cobalt);color:var(--cobalt);padding:8px 14px;border-radius:7px;font:inherit;font-weight:500;font-size:13px;cursor:pointer;">
                Save (in-place)
              </button>
              <button type="button" id="skills-form-cancel" style="display:none;background:transparent;border:1px solid var(--hairline-2);color:var(--ink-soft);padding:8px 14px;border-radius:7px;font:inherit;font-weight:500;font-size:13px;cursor:pointer;">
                Cancel
              </button>
              <span id="skills-form-status" class="hint" style="margin-left:6px;"></span>
            </div>
          </form>
        </div>

        <!-- Version history modal -->
        <div id="skills-versions-modal" style="display:none; position:fixed; inset:0; background:rgba(15,23,41,0.55); backdrop-filter: blur(6px); z-index:50; align-items:center; justify-content:center; padding:24px;">
          <div style="background:#fff; border-radius:14px; width:min(680px, 95vw); max-height:80vh; overflow:hidden; box-shadow: var(--shadow-lg); display:flex; flex-direction:column;">
            <div style="padding:14px 16px; border-bottom:1px solid var(--hairline); display:flex; align-items:center; justify-content:space-between;">
              <h3 id="skills-versions-title" style="margin:0; font-size:14px; font-weight:600;">Version history</h3>
              <button type="button" id="skills-versions-close" style="background:transparent;border:0;cursor:pointer;color:var(--ink-soft);font-size:18px;line-height:1;">×</button>
            </div>
            <div id="skills-versions-body" style="overflow-y:auto; flex:1; padding:0;"></div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <div id="toast" class="toast"></div>

<script>
  // ---------------------- token + auth -----------------------------------
  const params = new URLSearchParams(location.search);
  let TOKEN = params.get('token') || sessionStorage.getItem('atlas_admin_token') || '';

  function toast(msg, isErr) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isErr);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2400);
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, {
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': 'application/json',
    });
    const res = await fetch(path, opts);
    if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401 });
    if (!res.ok) throw Object.assign(new Error('request failed'), { status: res.status });
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
  }

  document.getElementById('gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tok = document.getElementById('gate-token').value.trim();
    if (!tok) return;
    TOKEN = tok;
    try {
      await api('/admin/v1/stats');
      sessionStorage.setItem('atlas_admin_token', TOKEN);
      document.getElementById('gate').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      loadAll();
    } catch (err) {
      const e = document.getElementById('gate-err');
      e.textContent = 'Token rejected. Check ADMIN_TOKEN on the backend.';
      e.style.display = 'block';
    }
  });

  // ---------------------- helpers ---------------------------------------
  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    const t = (new Date()).getTime() - d.getTime();
    if (t < 60_000) return 'just now';
    if (t < 3_600_000) return Math.floor(t / 60_000) + 'm ago';
    if (t < 86_400_000) return Math.floor(t / 3_600_000) + 'h ago';
    if (t < 604_800_000) return Math.floor(t / 86_400_000) + 'd ago';
    return d.toLocaleDateString();
  }
  function tierPill(t) {
    return '<span class="pill ' + t + '">' + (t || 'free') + '</span>';
  }
  function eventPill(ev) {
    const map = {
      sign_in_success: 'success',
      sign_in_failure: 'danger',
      token_refresh: '',
      token_theft_suspected: 'danger',
      sign_out: '',
      revoke_all: 'warn',
    };
    return '<span class="pill ' + (map[ev] ?? '') + '">' + ev + '</span>';
  }
  function escape(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------------------- renderers -------------------------------------
  async function loadStats() {
    const s = await api('/admin/v1/stats');
    const cards = [
      { label: 'Total users',       value: s.total_users },
      { label: 'Signups today',     value: s.signups_today },
      { label: 'Sign-ins today',    value: s.signins_today },
      { label: 'Active sessions',   value: s.active_sessions },
      { label: 'Theft events 7d',   value: s.theft_events_week, alert: s.theft_events_week > 0 },
    ];
    document.getElementById('stat-grid').innerHTML = cards.map(c =>
      '<div class="stat-card' + (c.alert ? ' alert' : '') + '">' +
        '<div class="label">' + c.label + '</div>' +
        '<div class="value">' + c.value.toLocaleString() + '</div>' +
      '</div>'
    ).join('');
  }

  async function loadPeople() {
    const users = await api('/admin/v1/users');
    document.getElementById('people-count').textContent = users.length + ' users';
    if (users.length === 0) {
      document.getElementById('people-table').innerHTML = '<div class="empty">No users yet.</div>';
      return;
    }
    const head = '<thead><tr>' +
      '<th>Email</th><th>Name</th><th>Tier</th><th>Active sessions</th>' +
      '<th>Joined</th><th>Last activity</th><th>Actions</th>' +
      '</tr></thead>';
    const rows = users.map(u =>
      '<tr>' +
        '<td class="email">' + escape(u.email) + '</td>' +
        '<td>' + escape(u.display_name ?? '—') + '</td>' +
        '<td>' + tierPill(u.tier) + '</td>' +
        '<td>' + u.active_sessions + '</td>' +
        '<td>' + fmtDate(u.created_at) + '</td>' +
        '<td>' + fmtDate(u.last_activity_at) + '</td>' +
        '<td><button class="action danger" data-act="revoke-all" data-uid="' + u.id + '" data-email="' + escape(u.email) + '">Revoke all</button></td>' +
      '</tr>'
    ).join('');
    document.getElementById('people-table').innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  async function loadSessions() {
    const ss = await api('/admin/v1/sessions');
    if (ss.length === 0) {
      document.getElementById('sessions-table').innerHTML = '<div class="empty">No active sessions.</div>';
      return;
    }
    const head = '<thead><tr>' +
      '<th>User</th><th>Device install id</th><th>Created</th><th>Expires</th>' +
      '</tr></thead>';
    const rows = ss.map(s =>
      '<tr>' +
        '<td class="email">' + escape(s.user_email) + '</td>' +
        '<td class="mono">' + escape(s.device_install_id) + '</td>' +
        '<td>' + fmtDate(s.created_at) + '</td>' +
        '<td>' + fmtDate(s.expires_at) + '</td>' +
      '</tr>'
    ).join('');
    document.getElementById('sessions-table').innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  async function loadAudit(targetId) {
    targetId = targetId || 'audit-table';
    const events = await api('/admin/v1/audit');
    if (events.length === 0) {
      document.getElementById(targetId).innerHTML = '<div class="empty">No events yet.</div>';
      return;
    }
    const head = '<thead><tr>' +
      '<th>When</th><th>Event</th><th>User</th><th>Detail</th>' +
      '</tr></thead>';
    const rows = events.map(e =>
      '<tr>' +
        '<td>' + fmtDate(e.occurred_at) + '</td>' +
        '<td>' + eventPill(e.event_type) + '</td>' +
        '<td class="email">' + escape(e.user_email ?? '—') + '</td>' +
        '<td class="mono">' + escape(e.error_code ?? '') + '</td>' +
      '</tr>'
    ).join('');
    document.getElementById(targetId).innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  async function loadRecentAudit() {
    // Smaller subset reused from /audit
    const events = (await api('/admin/v1/audit')).slice(0, 10);
    if (events.length === 0) {
      document.getElementById('recent-audit').innerHTML = '<div class="empty">No events yet.</div>';
      return;
    }
    const head = '<thead><tr><th>When</th><th>Event</th><th>User</th></tr></thead>';
    const rows = events.map(e =>
      '<tr>' +
        '<td>' + fmtDate(e.occurred_at) + '</td>' +
        '<td>' + eventPill(e.event_type) + '</td>' +
        '<td class="email">' + escape(e.user_email ?? '—') + '</td>' +
      '</tr>'
    ).join('');
    document.getElementById('recent-audit').innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  async function loadCatalogue() {
    const cat = await api('/admin/v1/catalogue');
    if (cat.length === 0) {
      document.getElementById('catalogue-table').innerHTML = '<div class="empty">No models in catalogue.</div>';
      return;
    }
    const head = '<thead><tr>' +
      '<th>Provider</th><th>Model</th><th>Display</th>' +
      '<th style="text-align:right">Input / 1M</th><th style="text-align:right">Output / 1M</th>' +
      '<th style="text-align:right">Context</th><th>Updated</th><th></th>' +
      '</tr></thead>';
    const rows = cat.map(m =>
      '<tr' + (m.deprecated ? ' style="opacity:.5"' : '') + '>' +
        '<td>' + escape(m.provider) + '</td>' +
        '<td class="mono">' + escape(m.model) + '</td>' +
        '<td>' + escape(m.display_name ?? '') + '</td>' +
        '<td style="text-align:right" class="mono">$' + Number(m.input_per_million).toFixed(2) + '</td>' +
        '<td style="text-align:right" class="mono">$' + Number(m.output_per_million).toFixed(2) + '</td>' +
        '<td style="text-align:right" class="mono">' + (m.context_window ? m.context_window.toLocaleString() : '—') + '</td>' +
        '<td>' + fmtDate(m.updated_at) + '</td>' +
        '<td><button class="action danger" data-act="del-catalogue" data-provider="' + escape(m.provider) + '" data-model="' + escape(m.model) + '">Delete</button></td>' +
      '</tr>'
    ).join('');
    document.getElementById('catalogue-table').innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  // Cached after each loadSkills() so action handlers can re-hydrate the form.
  let SKILLS_CACHE = [];

  async function loadSkills() {
    const skills = await api('/admin/v1/skills');
    SKILLS_CACHE = skills;
    if (skills.length === 0) {
      document.getElementById('skills-table').innerHTML = '<div class="empty">No skills published yet.</div>';
      return;
    }
    const head = '<thead><tr>' +
      '<th>Skill ID</th><th>Title</th><th>Kind</th><th>Publisher</th>' +
      '<th>Tier</th><th>Version</th><th>Updated</th><th>Actions</th>' +
      '</tr></thead>';
    const rows = skills.map(s =>
      '<tr' + (s.deprecated ? ' style="opacity:.5"' : '') + '>' +
        '<td class="mono">' + escape(s.skill_id) + '</td>' +
        '<td>' + escape(s.title) + '</td>' +
        '<td><span class="pill">' + escape(s.kind) + '</span></td>' +
        '<td>' + escape(s.publisher_name) +
          (s.publisher_verified ? ' <span class="pill success" style="margin-left:4px">verified</span>' : '') +
          '</td>' +
        '<td>' + tierPill(s.pricing_tier_min) + '</td>' +
        '<td class="mono">' + escape(s.version) + '</td>' +
        '<td>' + fmtDate(s.updated_at) + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="action" data-act="edit-skill" data-id="' + escape(s.skill_id) + '">Edit</button> ' +
          '<button class="action" data-act="versions-skill" data-id="' + escape(s.skill_id) + '">Versions</button> ' +
          '<button class="action danger" data-act="del-skill" data-id="' + escape(s.skill_id) + '">Delete</button>' +
        '</td>' +
      '</tr>'
    ).join('');
    document.getElementById('skills-table').innerHTML = '<table>' + head + '<tbody>' + rows + '</tbody></table>';
  }

  // --- Skill form mode helpers ----
  function resetSkillForm() {
    const f = document.getElementById('skills-form');
    f.reset();
    document.getElementById('skills-form-mode').value = 'publish';
    document.getElementById('skills-form-original-id').value = '';
    document.getElementById('skills-form-title').textContent = 'Publish a new skill';
    document.getElementById('skills-form-hint').textContent = 'first publish creates the catalogue row';
    document.getElementById('skills-form-submit').textContent = 'Publish new version';
    document.getElementById('skills-form-save-inplace').style.display = 'none';
    document.getElementById('skills-form-cancel').style.display = 'none';
    document.getElementById('skills-form-status').textContent = '';
    f.querySelector('[name=skill_id]').readOnly = false;
    document.getElementById('skills-form-changelog-wrap').style.display = '';
    document.getElementById('skills-form-submit').style.display = '';
  }

  function fillSkillFormFromRow(s) {
    const f = document.getElementById('skills-form');
    f.querySelector('[name=skill_id]').value = s.skill_id;
    f.querySelector('[name=skill_id]').readOnly = true;
    f.querySelector('[name=version]').value = s.version;
    f.querySelector('[name=kind]').value = s.kind;
    f.querySelector('[name=title]').value = s.title;
    f.querySelector('[name=description]').value = s.description ?? '';
    f.querySelector('[name=category]').value = s.category ?? 'general';
    f.querySelector('[name=publisher_name]').value = s.publisher_name ?? '';
    f.querySelector('[name=pricing_tier_min]').value = s.pricing_tier_min ?? 'free';
    f.querySelector('[name=manifest]').value = JSON.stringify(s.manifest ?? {}, null, 2);
    f.querySelector('[name=changelog]').value = '';

    document.getElementById('skills-form-mode').value = 'save';
    document.getElementById('skills-form-original-id').value = s.skill_id;
    document.getElementById('skills-form-title').textContent = 'Editing ' + s.skill_id;
    document.getElementById('skills-form-hint').textContent = 'Save = in-place (typo fixes); Publish new version = bump version';
    document.getElementById('skills-form-submit').textContent = 'Publish new version';
    document.getElementById('skills-form-save-inplace').style.display = '';
    document.getElementById('skills-form-cancel').style.display = '';
    document.getElementById('skills-form-status').textContent = '';
    document.getElementById('skills-form-changelog-wrap').style.display = '';
    // Scroll the form into view
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function openVersionHistory(skillId) {
    const modal = document.getElementById('skills-versions-modal');
    const body = document.getElementById('skills-versions-body');
    document.getElementById('skills-versions-title').textContent = 'Version history — ' + skillId;
    modal.style.display = 'flex';
    body.innerHTML = '<div class="empty">Loading…</div>';
    try {
      const versions = await api('/admin/v1/skills/' + encodeURIComponent(skillId) + '/versions');
      if (versions.length === 0) {
        body.innerHTML = '<div class="empty">No version history (older entry pre-dates v0.2).</div>';
        return;
      }
      const current = SKILLS_CACHE.find(s => s.skill_id === skillId);
      const currentVersion = current ? current.version : null;
      const rows = versions.map(v => {
        const isCurrent = v.version === currentVersion;
        return '<div style="padding: 12px 16px; border-bottom: 1px solid var(--hairline);">' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span class="mono" style="font-weight:600;">v' + escape(v.version) + '</span>' +
              (isCurrent ? ' <span class="pill success">current</span>' : '') +
              ' <span class="hint">' + fmtDate(v.published_at) + '</span>' +
            '</div>' +
            (isCurrent ? '' :
              '<button class="action" data-act="rollback-skill" data-id="' + escape(skillId) + '" data-version="' + escape(v.version) + '">Roll back</button>'
            ) +
          '</div>' +
          (v.changelog
            ? '<div style="margin-top:6px; font-size:12px; color:var(--ink-soft); line-height:1.5;">' + escape(v.changelog) + '</div>'
            : '<div style="margin-top:6px; font-size:11px; color:var(--ink-mute); font-style:italic;">no changelog</div>'
          ) +
        '</div>';
      }).join('');
      body.innerHTML = rows;
    } catch (e) {
      body.innerHTML = '<div class="empty" style="color:var(--danger)">Failed to load versions: ' + escape(e.message || 'unknown') + '</div>';
    }
  }

  function closeVersionHistory() {
    document.getElementById('skills-versions-modal').style.display = 'none';
  }
  // Hook up close button + backdrop click + escape
  document.getElementById('skills-versions-close').addEventListener('click', closeVersionHistory);
  document.getElementById('skills-versions-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeVersionHistory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeVersionHistory();
  });

  // Cancel-edit button
  document.getElementById('skills-form-cancel').addEventListener('click', resetSkillForm);

  async function loadAll() {
    try {
      await Promise.all([loadStats(), loadPeople(), loadSessions(), loadAudit(), loadRecentAudit(), loadCatalogue(), loadSkills()]);
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem('atlas_admin_token');
        location.reload();
      } else {
        toast('Load failed: ' + (e.message || 'unknown'), true);
      }
    }
  }

  // ---------------------- actions ---------------------------------------
  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('button.action');
    if (btn && btn.dataset.act === 'revoke-all') {
      const uid = btn.dataset.uid;
      const email = btn.dataset.email;
      if (!confirm('Revoke ALL active sessions for ' + email + '? They will be signed out everywhere.')) return;
      try {
        await api('/admin/v1/users/' + uid + '/revoke-all', { method: 'POST' });
        toast('Sessions revoked for ' + email);
        await Promise.all([loadStats(), loadPeople(), loadSessions(), loadAudit()]);
      } catch (err) {
        toast('Revoke failed: ' + err.message, true);
      }
    }
    if (btn && btn.dataset.act === 'edit-skill') {
      const id = btn.dataset.id;
      const s = SKILLS_CACHE.find(x => x.skill_id === id);
      if (s) fillSkillFormFromRow(s);
    }
    if (btn && btn.dataset.act === 'versions-skill') {
      openVersionHistory(btn.dataset.id);
    }
    if (btn && btn.dataset.act === 'rollback-skill') {
      const id = btn.dataset.id;
      const v = btn.dataset.version;
      if (!confirm('Roll back ' + id + ' to v' + v + '? The current version stays in history.')) return;
      try {
        await api('/admin/v1/skills/' + encodeURIComponent(id) + '/rollback/' + encodeURIComponent(v), { method: 'POST' });
        toast('Rolled back ' + id + ' to v' + v);
        closeVersionHistory();
        await loadSkills();
      } catch (err) {
        toast('Rollback failed: ' + (err.message || 'unknown'), true);
      }
    }
    if (btn && btn.dataset.act === 'del-skill') {
      const id = btn.dataset.id;
      if (!confirm('Delete skill ' + id + '?')) return;
      try {
        await api('/admin/v1/skills/' + encodeURIComponent(id), { method: 'DELETE' });
        toast('Deleted ' + id);
        await loadSkills();
      } catch (err) {
        toast('Delete failed: ' + err.message, true);
      }
    }
    if (btn && btn.dataset.act === 'del-catalogue') {
      const p = btn.dataset.provider;
      const m = btn.dataset.model;
      if (!confirm('Delete ' + p + '/' + m + ' from the catalogue?')) return;
      try {
        await api('/admin/v1/catalogue/' + encodeURIComponent(p) + '/' + encodeURIComponent(m), { method: 'DELETE' });
        toast('Deleted ' + p + '/' + m);
        await loadCatalogue();
      } catch (err) {
        toast('Delete failed: ' + err.message, true);
      }
    }
  });

  // Build a payload from the current form state. Returns null on bad JSON.
  function buildSkillPayload(form, formData) {
    let manifest = {};
    try {
      manifest = JSON.parse(formData.get('manifest') || '{}');
    } catch (err) {
      toast('Manifest must be valid JSON', true);
      return null;
    }
    return {
      skill_id: (formData.get('skill_id') || '').trim(),
      version: (formData.get('version') || '0.1.0').trim(),
      title: (formData.get('title') || '').trim(),
      description: (formData.get('description') || '').trim(),
      category: (formData.get('category') || 'general').trim(),
      publisher_name: (formData.get('publisher_name') || 'Unknown').trim(),
      kind: formData.get('kind') || 'composite',
      manifest,
      pricing_tier_min: formData.get('pricing_tier_min') || 'free',
      changelog: (formData.get('changelog') || '').trim() || undefined,
    };
  }

  // Submit handler — branches on mode.
  document.getElementById('skills-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = buildSkillPayload(e.target, f);
    if (!payload) return;
    // The visible submit button always means "Publish new version" —
    // in-place save uses its own button (handled separately).
    try {
      await api('/admin/v1/skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast('Published ' + payload.skill_id + ' v' + payload.version);
      resetSkillForm();
      await loadSkills();
    } catch (err) {
      const detail = err.message || 'unknown';
      if (detail.includes('version_already_published')) {
        toast('Version ' + payload.version + ' already exists — bump the version', true);
      } else {
        toast('Publish failed: ' + detail, true);
      }
    }
  });

  // In-place Save (no version bump) — only available when editing.
  document.getElementById('skills-form-save-inplace').addEventListener('click', async () => {
    const form = document.getElementById('skills-form');
    const f = new FormData(form);
    const payload = buildSkillPayload(form, f);
    if (!payload) return;
    const originalId = document.getElementById('skills-form-original-id').value;
    try {
      await api('/admin/v1/skills/' + encodeURIComponent(originalId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast('Saved (in-place) — version ' + payload.version + ' unchanged');
      resetSkillForm();
      await loadSkills();
    } catch (err) {
      const detail = err.message || 'unknown';
      if (detail.includes('version_mismatch_use_publish')) {
        toast('You changed the version — use "Publish new version" instead', true);
      } else {
        toast('Save failed: ' + detail, true);
      }
    }
  });

  // Catalogue add/update form
  document.getElementById('catalogue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      provider: f.get('provider'),
      model: f.get('model'),
      display_name: f.get('display_name') || null,
      input_per_million: f.get('input_per_million') ? Number(f.get('input_per_million')) : undefined,
      output_per_million: f.get('output_per_million') ? Number(f.get('output_per_million')) : undefined,
      context_window: f.get('context_window') ? Number(f.get('context_window')) : null,
    };
    try {
      await api('/admin/v1/catalogue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast('Saved ' + payload.provider + '/' + payload.model);
      e.target.reset();
      await loadCatalogue();
    } catch (err) {
      toast('Save failed: ' + err.message, true);
    }
  });

  // ---------------------- tabs ------------------------------------------
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const page = btn.dataset.page;
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('section.page').forEach(s => s.classList.toggle('active', s.id === 'page-' + page));
  });

  // ---------------------- bootstrap --------------------------------------
  if (TOKEN) {
    // try silently
    api('/admin/v1/stats').then(() => {
      sessionStorage.setItem('atlas_admin_token', TOKEN);
      document.getElementById('gate').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      loadAll();
      // refresh stats every 30s
      setInterval(() => loadStats().catch(() => {}), 30_000);
    }).catch(() => {
      sessionStorage.removeItem('atlas_admin_token');
    });
  }
</script>
</body>
</html>`;
}
