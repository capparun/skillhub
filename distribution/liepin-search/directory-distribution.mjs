import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Copy first on the destination filesystem. Keep the previous tree until the
// new copy is installed, and restore it if the final rename fails.
export function replaceDirectory(source, destination, io = fs) {
  const suffix = crypto.randomUUID();
  const stage = `${destination}.install-${suffix}`;
  const backup = `${destination}.old-${suffix}`;
  let previous = null;
  io.mkdirSync(path.dirname(destination), {recursive:true});
  try {
    // npm bin/workspace links must remain relative after the runtime moves.
    io.cpSync(source, stage, {recursive:true, errorOnExist:true, force:false, verbatimSymlinks:true});
    if (io.existsSync(destination)) {
      io.renameSync(destination, backup);
      previous = backup;
    }
    try { io.renameSync(stage, destination); }
    catch (error) {
      if (previous) io.renameSync(previous, destination);
      throw error;
    }
    return previous;
  } finally {
    // Never let cleanup failure hide the installation/rollback outcome.
    try { io.rmSync(stage, {recursive:true, force:true}); } catch { /* task-owned residue */ }
  }
}
