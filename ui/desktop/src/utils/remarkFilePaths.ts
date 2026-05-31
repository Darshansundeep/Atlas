/**
 * remark plugin (spec 006): detect absolute file paths in plain text nodes
 * and convert them to link nodes with href = `atlas-file://<percent-encoded path>`.
 *
 * The MarkdownContent <a> renderer intercepts that scheme and renders a
 * FilePathChip instead of a real link.
 *
 * Patterns recognised:
 *   - POSIX absolute: `/foo/bar/baz.ext`         (must start with / and look path-ish)
 *   - Home-relative:  `~/foo/bar.ext`
 *   - Windows:        `C:\foo\bar.ext` or `C:/foo/bar.ext`
 *
 * Heuristics — keep false positives low:
 *   - Must contain at least one path separator after the root.
 *   - POSIX paths must have a file-extension OR be at least 3 segments deep.
 *   - Skip nodes inside `code`, `inlineCode`, `link`, `linkReference`.
 */

import type { Plugin } from 'unified';
import type { Root, Text, Link } from 'mdast';
import { visit, SKIP } from 'unist-util-visit';

// Matches:
//   /Users/foo/bar.txt
//   ~/code/atlas/README.md
//   C:\Users\foo\bar.txt
//   D:/projects/x/y.png
// Word-boundary on both ends so we don't grab middle-of-word noise.
const FILE_PATH_REGEX =
  // eslint-disable-next-line no-useless-escape
  /(?<![\w/\\])((?:~\/|\/|[A-Za-z]:[\\/])[\w.\-+ /\\]+?\.[\w]{1,12})(?![\w/\\])/g;

// POSIX paths *without* an extension: 3+ segments deep, e.g. /Users/foo/bar
const POSIX_DIR_REGEX = /(?<![\w/])((?:~\/|\/)(?:[\w.\-+]+\/){2,}[\w.\-+]+)\/?(?![\w/])/g;

function isLikelyFilePath(s: string): boolean {
  if (s.length < 4 || s.length > 1024) return false;
  if (s.startsWith('//')) return false; // URL like //example.com
  // exclude obvious URL roots — those go through the http/https/atlas-file path
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false;
  return true;
}

function makeLink(value: string): Link {
  return {
    type: 'link',
    url: `atlas-file://${encodeURIComponent(value)}`,
    title: null,
    children: [{ type: 'text', value }],
  };
}

export const remarkFilePaths: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || index === null) return;
      // Skip inside elements where we shouldn't transform.
      const parentType = (parent as { type?: string }).type;
      if (
        parentType === 'link' ||
        parentType === 'linkReference' ||
        parentType === 'inlineCode' ||
        parentType === 'code'
      ) {
        return;
      }

      const original = node.value;
      if (!original) return;

      // Two-pass match: extension paths first, then bare dir paths from the leftover.
      const matches: Array<{ start: number; end: number; value: string }> = [];
      let m: RegExpExecArray | null;

      FILE_PATH_REGEX.lastIndex = 0;
      while ((m = FILE_PATH_REGEX.exec(original)) !== null) {
        const v = m[1];
        if (isLikelyFilePath(v)) {
          matches.push({ start: m.index, end: m.index + v.length, value: v });
        }
      }

      POSIX_DIR_REGEX.lastIndex = 0;
      while ((m = POSIX_DIR_REGEX.exec(original)) !== null) {
        const v = m[1];
        const start = m.index;
        const end = m.index + v.length;
        // Skip if overlapping a match we already found.
        if (matches.some((x) => start < x.end && end > x.start)) continue;
        if (isLikelyFilePath(v)) {
          matches.push({ start, end, value: v });
        }
      }

      if (matches.length === 0) return;

      matches.sort((a, b) => a.start - b.start);

      // Rebuild children: text fragments + Link nodes interleaved.
      const newChildren: Array<Text | Link> = [];
      let cursor = 0;
      for (const match of matches) {
        if (match.start > cursor) {
          newChildren.push({ type: 'text', value: original.slice(cursor, match.start) });
        }
        newChildren.push(makeLink(match.value));
        cursor = match.end;
      }
      if (cursor < original.length) {
        newChildren.push({ type: 'text', value: original.slice(cursor) });
      }

      const parentNode = parent as { children: unknown[] };
      parentNode.children.splice(index, 1, ...newChildren);
      return [SKIP, index + newChildren.length];
    });
  };
};

export const ATLAS_FILE_SCHEME = 'atlas-file:';

export function decodeAtlasFilePath(href: string): string | null {
  if (!href.startsWith('atlas-file://')) return null;
  try {
    return decodeURIComponent(href.slice('atlas-file://'.length));
  } catch {
    return null;
  }
}
