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
    console.log('[DEBUG-gllue-directory]', JSON.stringify({stageExists:io.existsSync(stage),stageDirectory:io.lstatSync(stage).isDirectory(),destinationExists:io.existsSync(destination),parentExists:io.existsSync(path.dirname(destination)),entries:io.readdirSync(stage)}));
    if (io.existsSync(destination)) {
      io.renameSync(destination, backup);
      previous = backup;
    }
    try {
      io.renameSync(stage, destination);
      // Rebind after the destination exists; Windows cannot reliably rename a
      // directory containing junctions aimed at its not-yet-existing new path.
      relinkWorkspaces(destination, destination, io);
    }
    catch (error) {
      if (io.existsSync(destination)) io.renameSync(destination, stage);
      if (previous) io.renameSync(previous, destination);
      throw error;
    }
    return previous;
  } finally {
    // Never let cleanup failure hide the installation/rollback outcome.
    try { io.rmSync(stage, {recursive:true, force:true}); } catch { /* task-owned residue */ }
  }
}

// Windows npm workspaces use absolute junctions. Rebind only links belonging to
// this runtime before switching directories, so deleting extraction is safe.
function relinkWorkspaces(stage, destination, io) {
  const packages = path.join(stage, 'packages');
  if (!io.existsSync(packages)) return;
  for (const folder of io.readdirSync(packages)) {
    const manifest = path.join(packages, folder, 'package.json');
    if (!io.existsSync(manifest)) continue;
    const { name } = JSON.parse(io.readFileSync(manifest, 'utf8'));
    if (typeof name !== 'string' || !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error('Invalid runtime workspace name');
    const link = path.join(stage, 'node_modules', name);
    let info;
    try { info = io.lstatSync(link); } catch { continue; }
    if (!info.isSymbolicLink()) throw new Error('Runtime workspace is not a link');
    io.unlinkSync(link);
    const target = path.join(destination, 'packages', folder);
    io.symlinkSync(process.platform === 'win32' ? target : path.relative(path.dirname(link), path.join(stage,'packages',folder)), link, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
