// Local HTTP fixture for the unmodified official PowerShell bootstrap.
// No production database, credentials, browser, or candidate data are used.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { GET } from '../src/app/install.ps1/route';
async function main() {
const release = JSON.parse(fs.readFileSync('public/download/gllue-only-v1.3.0.json','utf8'));
const bootstrap = Buffer.from(await (await GET()).arrayBuffer());
http.createServer((req,res) => {
  if (req.url === '/install.ps1') { res.setHeader('content-type','text/plain; charset=utf-8'); res.end(bootstrap); }
  else if (req.url === '/api/releases/latest?product=gllue-only') { res.setHeader('content-type','application/json'); res.end(JSON.stringify({...release,downloadUrl:process.env.PUBLIC_APP_URL+'/package.tar.gz'})); }
  else if (req.url === '/package.tar.gz') fs.createReadStream(path.join('public/download',release.file)).pipe(res);
  else { res.statusCode=404;res.end(); }
}).listen(18764,'127.0.0.1',() => console.log('fixture-ready'));

}
main().catch(error => { console.error(error); process.exitCode=1; });
