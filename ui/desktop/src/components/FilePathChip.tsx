/**
 * FilePathChip — spec 006 inline file-path chip.
 *
 * Clicking opens the file in its OS-default app; right-clicking reveals it
 * in Finder/Explorer. Renders inline within message text.
 */

import React, { useCallback, useState } from 'react';
import {
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileSpreadsheet,
  FileVideo,
  FileAudio,
  Folder,
  FolderOpen,
} from 'lucide-react';

type IconKind = React.ComponentType<{ className?: string }>;

const EXT_TO_ICON: Record<string, IconKind> = {
  // text / docs
  txt: FileText,
  md: FileText,
  rtf: FileText,
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  odt: FileText,
  // code
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  json: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  cs: FileCode,
  rb: FileCode,
  php: FileCode,
  sh: FileCode,
  zsh: FileCode,
  bash: FileCode,
  yml: FileCode,
  yaml: FileCode,
  toml: FileCode,
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  sql: FileCode,
  // images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  webp: FileImage,
  svg: FileImage,
  bmp: FileImage,
  tiff: FileImage,
  // archives
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  bz2: FileArchive,
  '7z': FileArchive,
  rar: FileArchive,
  // sheets
  csv: FileSpreadsheet,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  ods: FileSpreadsheet,
  // video / audio
  mp4: FileVideo,
  mov: FileVideo,
  mkv: FileVideo,
  webm: FileVideo,
  avi: FileVideo,
  mp3: FileAudio,
  wav: FileAudio,
  flac: FileAudio,
  m4a: FileAudio,
  ogg: FileAudio,
};

function iconFor(path: string): IconKind {
  // Directory-ish: no extension OR trailing slash
  if (path.endsWith('/') || path.endsWith('\\')) return Folder;
  const lastDot = path.lastIndexOf('.');
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastDot <= lastSlash) return Folder;
  const ext = path.slice(lastDot + 1).toLowerCase();
  return EXT_TO_ICON[ext] ?? File;
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '');
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (lastSlash === -1) return trimmed;
  return trimmed.slice(lastSlash + 1) || trimmed;
}

interface FilePathChipProps {
  path: string;
}

export const FilePathChip: React.FC<FilePathChipProps> = ({ path }) => {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icon = iconFor(path);
  const name = basenameOf(path);
  const isDir = Icon === Folder;
  const DisplayIcon = isDir && opening ? FolderOpen : Icon;

  const open = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      const ok = await window.electron.openFilePath(path);
      if (!ok) setError('Could not open');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open');
    } finally {
      setOpening(false);
    }
  }, [path]);

  const reveal = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await window.electron.showItemInFolder(path);
      } catch {
        // best-effort; no UI noise
      }
    },
    [path]
  );

  return (
    <button
      type="button"
      onClick={open}
      onContextMenu={reveal}
      title={error ? `${path}\n(${error})` : `${path}\n(right-click to reveal)`}
      // Inherit color from the parent (user bubble = cream; assistant card
      // = ink). A translucent currentColor background + border so it reads
      // on either substrate without explicit colour binding.
      style={{
        background: 'color-mix(in srgb, currentColor 10%, transparent)',
        borderColor: 'color-mix(in srgb, currentColor 28%, transparent)',
        color: 'inherit',
      }}
      className={[
        'inline-flex items-center gap-1.5 align-baseline',
        'mx-0.5 px-1.5 py-0.5 rounded-md',
        'text-[0.92em] font-mono leading-tight',
        'border',
        'transition-colors cursor-pointer hover:brightness-110',
        'no-underline',
        error ? 'text-text-error border-border-error' : '',
      ].join(' ')}
      data-atlas-file-chip="true"
    >
      <DisplayIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      <span className="truncate max-w-[28ch]">{name}</span>
    </button>
  );
};
