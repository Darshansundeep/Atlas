# Feature Specification: Tool-Call Progress + Cancel

**Feature Branch**: `005-tool-call-progress`
**Status**: Stub — full draft pending `/speckit-specify`
**Created**: 2026-05-31

## Problem

When the agent executes a tool call that takes longer than ~10 seconds, the UI shows only "Atlas is working…" with no time indication, no cancel option, no failure detection. Users have observed tool calls hang for 20+ minutes without feedback (e.g., docx-tool blocked by a Word file lock; large LLM responses; stuck MCP extension). The agent feels frozen and the user has no honest information to decide whether to wait or restart.

## Desired behaviour

1. After ~3 seconds of activity, the loading indicator shows the **elapsed time** alongside the existing text.
2. After ~15 seconds, a **Cancel** button appears next to the indicator.
3. After ~60 seconds, the text changes to "this is taking longer than usual" and adds a "Diagnose" affordance.
4. After ~5 minutes, the call is presumed stuck — explicit "Likely stuck. [Cancel and report] [Continue waiting]" prompt.
5. Cancel sends an abort signal to the tool runner (via goosed's existing per-tool-call session lifecycle) and surfaces the partial state.

## Open questions for `/speckit-clarify`

1. What's the right abort mechanism? goosed's existing session-cancel vs a per-tool-call signal?
2. Does "diagnose" copy a JSON bundle to clipboard, or post to a remote support channel?
3. Should the timeout thresholds be user-configurable in Settings?
