"""Build the frozen LinkedIn distribution as deterministic Windows-compatible USTAR."""
from pathlib import Path
import gzip, hashlib, io, json, tarfile
root=Path(__file__).resolve().parents[1]
src=root/'distribution/linkedin-only'
d=json.loads((src/'distribution.json').read_text())
version=d['version']
if d['product']!='soho-sourcing' or version!='2.1.2':raise ValueError('Unexpected release identity')
files=[]
for p in sorted(src.rglob('*')):
 if 'node_modules' in p.parts:continue
 if p.is_symlink():raise ValueError('Symlink in release source')
 if p.is_file():
  if p.name.startswith('._') or p.name in ['.DS_Store','.env','.npmrc']:raise ValueError('Private or platform metadata in source')
  files.append(p)
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w',format=tarfile.USTAR_FORMAT) as archive:
 for p in files:
  data=p.read_bytes();info=tarfile.TarInfo(p.relative_to(src).as_posix());info.size=len(data);info.mode=0o644;info.mtime=0
  archive.addfile(info,io.BytesIO(data))
output=root/'public/download';output.mkdir(parents=True,exist_ok=True)
name=f'soho-sourcing-v{version}.tar.gz'
content=gzip.compress(buffer.getvalue(),mtime=0)
manifest={'product':'soho-sourcing','version':version,'file':name,'sha256':hashlib.sha256(content).hexdigest(),'sizeBytes':len(content),'fileCount':len(files)}
archive=output/name
if archive.exists() and archive.read_bytes()!=content:raise ValueError('Refusing to overwrite different release artifact')
archive.write_bytes(content)
(output/f'soho-sourcing-v{version}.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
