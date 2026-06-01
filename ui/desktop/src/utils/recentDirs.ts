import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';

const RECENT_DIRS_FILE = path.join(app.getPath('userData'), 'recent-dirs.json');
const MAX_RECENT_DIRS = 10;

/**
 * Resolve the default working directory for a NEW chat (not a session
 * resume — those keep their saved working_dir).
 *
 * Order:
 *   1. ~/Downloads (when it exists). Matches user expectation that
 *      generated documents land where browser downloads do.
 *   2. The most-recent recent-dir (if any).
 *   3. $HOME (last-resort fallback).
 *
 * Recent dirs are NOT auto-preferred any more — they were before, which
 * caused generated documents to land in the wrong folder once a user
 * had opened a chat in any other directory.
 */
export function defaultDirForNewChat(): string {
  const home = os.homedir();
  const downloads = path.join(home, 'Downloads');
  try {
    if (fs.statSync(downloads).isDirectory()) return downloads;
  } catch {
    /* fall through */
  }
  const recents = loadRecentDirs();
  if (recents.length > 0) return recents[0];
  return home;
}

interface RecentDirs {
  dirs: string[];
}

export function loadRecentDirs(): string[] {
  try {
    if (fs.existsSync(RECENT_DIRS_FILE)) {
      const data = fs.readFileSync(RECENT_DIRS_FILE, 'utf8');
      const recentDirs: RecentDirs = JSON.parse(data);

      // Filter out invalid directories (nonexistent or not directories)
      const validDirs = recentDirs.dirs.filter((dir) => {
        try {
          // Use lstat to detect symlinks and validate path structure
          const stats = fs.lstatSync(dir);

          // Reject symlinks for security
          if (stats.isSymbolicLink()) {
            console.warn(
              `Removing symlink from recent directories for security: ${path.basename(dir)}`
            );
            return false;
          }

          return stats.isDirectory();
        } catch {
          // Directory doesn't exist or can't be accessed - don't log full path for security
          console.warn(`Removing inaccessible recent directory`);
          return false;
        }
      });

      // Save the cleaned list back if it changed
      if (validDirs.length !== recentDirs.dirs.length) {
        fs.writeFileSync(RECENT_DIRS_FILE, JSON.stringify({ dirs: validDirs }, null, 2));
      }

      return validDirs;
    }
  } catch (error) {
    console.error('Error loading recent directories:', error);
  }
  return [];
}

export function addRecentDir(dir: string): void {
  try {
    // Validate that the path is actually a directory before adding it
    try {
      const stats = fs.lstatSync(dir);

      // Reject symlinks for security
      if (stats.isSymbolicLink()) {
        console.warn(`Cannot add recent directory: symlinks not allowed for security`);
        return;
      }

      if (!stats.isDirectory()) {
        console.warn(`Cannot add recent directory: not a directory`);
        return;
      }
    } catch {
      console.warn(`Cannot add recent directory: path does not exist or cannot be accessed`);
      return;
    }

    let dirs = loadRecentDirs();
    // Remove the directory if it already exists
    dirs = dirs.filter((d) => d !== dir);
    // Add the new directory at the beginning
    dirs.unshift(dir);
    // Keep only the most recent MAX_RECENT_DIRS
    dirs = dirs.slice(0, MAX_RECENT_DIRS);

    fs.writeFileSync(RECENT_DIRS_FILE, JSON.stringify({ dirs }, null, 2));
  } catch (error) {
    console.error('Error saving recent directory:', error);
  }
}
