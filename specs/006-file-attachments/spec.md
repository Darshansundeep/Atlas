# Feature Specification: File Attachment UX

**Feature Branch**: `006-file-attachments`
**Status**: shipped (clickable chips for path mentions in both user + assistant messages)
**Created**: 2026-05-31

## Implementation status

Shipped: remarkFilePaths detects POSIX (`/...`), home-relative (`~/...`),
and Windows (`C:\\...`, `D:/...`) paths in text nodes; emits link nodes
with `atlas-file://` scheme. MarkdownContent intercepts and renders
FilePathChip with file-type icon, click-to-open via `shell.openPath`,
right-click via `shell.showItemInFolder`. Skips paths inside `code` /
`inlineCode` / `link` parents to avoid double-transforming.

Deferred (still in original open questions):
- Hover preview thumbnails for image / PDF
- Inline chips for paperclip-uploaded attachments on user message
- Tooltip showing file size + last-modified-date

## Problem

The chat treats file paths as plain text. A user pasting `/Users/foo/Downloads/report.docx` sees an unformatted string. They cannot click it to open the file, cannot preview it inline, and cannot tell from the chat history whether the agent actually read the file or hallucinated content based on the filename. The existing paperclip-upload affordance in the chat input is functional but produces no visible artifact in the chat thread itself.

## Desired behaviour

1. **Inline file-path detection**: any text in a chat message matching a local file-path pattern (absolute paths starting with `/`, `~/`, or `C:\` on Windows) renders as a styled chip with the filename, file-type icon, and a click action.
2. **Click → open in default app** via Electron's `shell.openPath()` — Word for .docx, Preview for .pdf, etc.
3. **Right-click → reveal in Finder/Explorer** via `shell.showItemInFolder()`.
4. **Attachments uploaded via paperclip** also render as inline chips on the user's own message, not just as side-channel uploads.
5. **Hover preview** for image / PDF attachments (small thumbnail popover).

## Open questions for `/speckit-clarify`

1. Should the chip detection also work in **assistant** messages (security implication: model could try to open files the user didn't intend)? Probably yes with explicit user-click required, no auto-open.
2. What's the file-size cap on inline preview thumbnails before falling back to the icon?
3. Should the chip show file size + last-modified-date in a tooltip?
