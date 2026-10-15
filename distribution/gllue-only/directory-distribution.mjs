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
    copyTree(source, stage, io);
    if (io.existsSync(destination)) {
      io.renameSync(destination, backup);
      previous = backup;
    }
    try {
      io.renameSync(stage, destination);
      // Absolute workspace junctions must point into the persistent runtime.
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
// this runtime after switching directories, so deleting extraction is safe.
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

// Explicit lstat/copy preserves junctions and Unicode paths on Windows; the
// native recursive cp used by the old installer did neither in acceptance.
function copyTree(source, destination, io) {
  const info = io.lstatSync(source);
  if (info.isSymbolicLink()) {
    let directory = false;
    try { directory = io.statSync(source).isDirectory(); } catch { /* retain dangling link */ }
    io.symlinkSync(io.readlinkSync(source), destination, process.platform === 'win32' && directory ? 'junction' : 'file');
  } else if (info.isDirectory()) {
    io.mkdirSync(destination);
    for (const entry of io.readdirSync(source)) copyTree(path.join(source,entry),path.join(destination,entry),io);
  } else if (info.isFile()) {
    io.copyFileSync(source,destination,io.constants.COPYFILE_EXCL);
    io.chmodSync(destination,info.mode);
  } else throw new Error('Unsupported runtime file type');
}
