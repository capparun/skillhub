import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Avoid fs.cpSync: Node 22 on Windows can terminate natively while copying
// installation trees. Preserve link text and executable modes explicitly.
function copyTree(source, destination, io) {
  const entry = io.lstatSync(source);
  if (entry.isSymbolicLink()) {
    const target = io.readlinkSync(source);
    let type = 'file';
    try { if (io.statSync(source).isDirectory()) type = 'dir'; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    io.symlinkSync(target, destination, type);
  } else if (entry.isDirectory()) {
    io.mkdirSync(destination);
    for (const name of io.readdirSync(source).sort()) {
      copyTree(path.join(source, name), path.join(destination, name), io);
    }
    io.chmodSync(destination, entry.mode);
  } else if (entry.isFile()) {
    io.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    io.chmodSync(destination, entry.mode);
  } else {
    throw new Error('安装来源包含不支持的文件类型');
  }
}

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
