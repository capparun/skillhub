import fs from 'node:fs';
import path from 'node:path';
export function findPackageRoot(directory) {
  const roots = [directory, ...fs.readdirSync(directory).map(name => path.join(directory, name))]
    .filter(candidate => fs.lstatSync(candidate).isDirectory() &&
      fs.existsSync(path.join(candidate, 'install.mjs')));
  if (roots.length !== 1) throw new Error('安装包内容不正确：需要唯一的 install.mjs 包根目录');
  return roots[0];
}
