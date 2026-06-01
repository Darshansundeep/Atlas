/**
 * TaskPanel — Claude-style "what the agent is working on" side panel.
 *
 * The agent's built-in Todo platform extension lets it write/rewrite a
 * markdown checklist per session via the `todo_write` tool. This panel
 * scans the message stream for the LATEST todo_write tool call, parses
 * the checklist, and renders it on the right side of the chat with
 * status chips per item.
 *
 * Zero coupling to goosed internals — we read from the message stream
 * the desktop already has. No new endpoints, no SSE.
 *
 * Item states recognised:
 *   - [x] / [X] → done
 *   - [-]       → cancelled / skipped
 *   - [~]       → in-progress (informal Atlas convention)
 *   - [ ]       → pending
 */

import { useMemo } from 'react';
import { CheckCircle2, Circle, Loader2, MinusCircle } from 'lucide-react';
import type { Message } from '../api';
import { getToolRequests } from '../types/message';
import { AtlasMark } from './atlas-brand/AtlasMark';

interface TaskItem {
  text: string;
  status: 'done' | 'pending' | 'in_progress' | 'cancelled';
  depth: number;
}

interface ParsedTodo {
  items: TaskItem[];
  raw: string;
}

const CHECKBOX_LINE = /^(\s*)-\s+\[([ xX~\-])\]\s+(.+?)\s*$/;

function parseChecklist(md: string): TaskItem[] {
  const items: TaskItem[] = [];
  for (const line of md.split('\n')) {
    const m = CHECKBOX_LINE.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const marker = m[2];
    const text = m[3];
    const depth = Math.floor(indent / 2);
    let status: TaskItem['status'] = 'pending';
    if (marker === 'x' || marker === 'X') status = 'done';
    else if (marker === '~') status = 'in_progress';
    else if (marker === '-') status = 'cancelled';
    items.push({ text, status, depth });
  }
  return items;
}

/** Find the most-recent todo_write tool call's `content` across all messages. */
function extractLatestTodo(messages: Message[]): ParsedTodo | null {
  let latest: string | null = null;
  for (const msg of messages) {
    for (const req of getToolRequests(msg)) {
      const tc = (req as { toolCall?: Record<string, unknown> }).toolCall;
      if (!tc) continue;
      const name = (tc.name as string | undefined) ?? '';
      if (!name.endsWith('todo_write') && name !== 'todo_write') continue;
      // tc.params or tc.arguments depending on shape
      const args =
        (tc.arguments as Record<string, unknown> | undefined) ??
        (tc.params as Record<string, unknown> | undefined) ??
        {};
      const content = args.content;
      if (typeof content === 'string') {
        latest = content; // keep overwriting so we end with newest
      }
    }
  }
  if (!latest) return null;
  return { items: parseChecklist(latest), raw: latest };
}

interface TaskPanelProps {
  messages: Message[];
  /** When the agent is streaming, the in-flight item gets a spinner. */
  isStreaming?: boolean;
}

const ICONS = {
  done: CheckCircle2,
  pending: Circle,
  in_progress: Loader2,
  cancelled: MinusCircle,
} as const;

const COLORS = {
  done: 'var(--color-text-success)',
  pending: 'var(--color-text-tertiary)',
  in_progress: 'var(--atlas-brand-amber)',
  cancelled: 'var(--color-text-tertiary)',
} as const;

export default function TaskPanel({ messages, isStreaming = false }: TaskPanelProps) {
  const todo = useMemo(() => extractLatestTodo(messages), [messages]);

  if (!todo || todo.items.length === 0) {
    return (
      <div
        className="h-full w-full p-5 flex flex-col"
        style={{
          background: 'var(--color-background-secondary)',
          borderLeft: '1px solid var(--color-border-primary)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <AtlasMark size={16} />
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Tasks
          </span>
        </div>
        <div
          className="text-xs flex-1 flex items-center justify-center text-center px-4"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          When the agent plans a multi-step task its checklist will appear here.
        </div>
      </div>
    );
  }

  const total = todo.items.length;
  const done = todo.items.filter((i) => i.status === 'done').length;
  const inProgress = todo.items.filter((i) => i.status === 'in_progress').length;

  return (
    <div
      className="h-full w-full overflow-y-auto"
      style={{
        background: 'var(--color-background-secondary)',
        borderLeft: '1px solid var(--color-border-primary)',
      }}
    >
      <div className="px-5 pt-5 pb-3 sticky top-0" style={{ background: 'var(--color-background-secondary)' }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <AtlasMark size={16} />
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}
            >
              Tasks
            </span>
          </div>
          <span
            className="tabular-nums"
            style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}
          >
            {done} / {total}
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'var(--color-background-tertiary)' }}
        >
          <div
            style={{
              width: `${Math.round((done / total) * 100)}%`,
              height: '100%',
              background:
                'linear-gradient(90deg, var(--atlas-brand-cobalt), var(--atlas-brand-amber))',
              transition: 'width 200ms ease-out',
            }}
          />
        </div>
      </div>

      <ul className="px-3 pb-5 space-y-1">
        {todo.items.map((item, i) => {
          // Show spinner on the FIRST in-progress item, or on the first
          // pending item when the agent is actively streaming.
          const Icon =
            item.status === 'in_progress' ||
            (isStreaming && item.status === 'pending' && inProgress === 0 && i === firstPendingIdx(todo.items))
              ? Loader2
              : ICONS[item.status];
          const isSpin =
            item.status === 'in_progress' ||
            (isStreaming && item.status === 'pending' && inProgress === 0 && i === firstPendingIdx(todo.items));

          return (
            <li
              key={i}
              className="flex items-start gap-2 px-2 py-1.5 rounded"
              style={{
                paddingLeft: 8 + item.depth * 16,
                color: item.status === 'done' || item.status === 'cancelled'
                  ? 'var(--color-text-secondary)'
                  : 'var(--atlas-brand-ink)',
              }}
            >
              <Icon
                className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${isSpin ? 'animate-spin' : ''}`}
                style={{ color: COLORS[item.status] }}
              />
              <span
                style={{
                  fontSize: '0.82rem',
                  lineHeight: 1.45,
                  textDecoration: item.status === 'done' || item.status === 'cancelled' ? 'line-through' : 'none',
                  textDecorationColor: 'var(--color-text-tertiary)',
                }}
              >
                {item.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function firstPendingIdx(items: TaskItem[]): number {
  return items.findIndex((i) => i.status === 'pending');
}
