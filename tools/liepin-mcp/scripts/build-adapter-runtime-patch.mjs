// Produce isolated replacement files; never edit the installed official package.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [upstream,output]=process.argv.slice(2);
if(!upstream||!output)throw Error('usage: build-adapter-runtime-patch upstream output');
if(JSON.parse(fs.readFileSync(path.join(upstream,'package.json'))).version!=='0.0.30')throw Error('Requires official 0.0.30');
const relative='dist/src/runtime/runtime.js';
const original=fs.readFileSync(path.join(upstream,relative),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(hash(original)!=='6f1176214c82a39d0dd5928f8293b38c2e67e2622694cf6f37645a1248c68e87')throw Error('Official runtime source hash differs; review before patching');
const executorPath='dist/src/sites/executor.js';
const executor=fs.readFileSync(path.join(upstream,executorPath),'utf8');
if(hash(executor)!=='01f1c67e413e06f799240e6b89ca4e39f254730d18fa92daeed7b765f2a1877a')throw Error('Official executor source hash differs; review before patching');
const executorMarker='const ctx = { args, tab: model.tab, sites: model.sites, recon: model.recon, signal: opts.signal };';
if(executor.split(executorMarker).length!==2)throw Error('Executor patch anchor changed');
const patchedExecutor=executor.replace(executorMarker,executorMarker+'\n        if (cmd.site === \'liepin\') { ctx.tabs = model.tabs; ctx.userTabs = model.userTabs; ctx.adoptTab = model.adoptTab; ctx.detailReviews = model.detailReviews; }');
const marker='return { tab, page, sites: api.sites, recon: api.recon };';
if(original.split(marker).length!==2)throw Error('Runtime patch anchor changed');
const replacement=`if (site !== 'liepin') return { tab, page, sites: api.sites, recon: api.recon };
        const detailReviews = detailReviewStore(state);
        const lifecycle = createAdapterTabLifecycle({
            reviewStore: detailReviews,
            tab,
            verifyAdoption: async (id, expectedUrl) => {
                const url = new URL(expectedUrl);
                if (url.origin !== 'https://h.liepin.com' || url.pathname !== '/resume/showresumedetail/' || url.searchParams.getAll('res_id_encode').length !== 1 || !url.searchParams.get('res_id_encode')) throw new Error('Invalid detail adoption URL');
                const result = await this.bridge.send('chrome-call', { session: sessionId, surface: 'adapter', chromeMethod: 'tabs.get', chromeArgs: [Number(id)] });
                if (result.data?.id !== Number(id) || result.data.url !== expectedUrl || result.data.openerTabId !== Number(tab.id)) throw new Error('Detail opener or address not confirmed');
                await userTabs.bind(String(id), expectedUrl);
            },
            openTab: async (url) => { const id = await page.newTab(url); state.finalized = false; return id; },
            bindTab: async (id) => new Tab(id, { rt: this, sessionId, state }, await this.createPage({ session: sessionId, surface: 'adapter', page: id })),
            activateTab: async (id) => {
                if (!this.hasFeature('chrome-api')) throw new Error('chrome-api unavailable');
                const route = { session: sessionId, surface: 'adapter' };
                await this.bridge.send('chrome-call', { ...route, chromeMethod: 'tabs.update', chromeArgs: [Number(id), { active: true }] });
                const result = await this.bridge.send('chrome-call', { ...route, chromeMethod: 'tabs.get', chromeArgs: [Number(id)] });
                if (result.data?.id !== Number(id) || result.data.active !== true) throw new Error('Parent activation not confirmed');
            }
        });
        const userTabs = createAdapterUserTabs({
            list: () => page.userTabs({query:"h.liepin.com",limit:100}), listBound: () => page.tabs(), claim: (request) => page.claim(request),
            getMetadata: async (id) => {
                try {
                    const result = await this.bridge.send('chrome-call', { session: sessionId, surface: 'adapter', chromeMethod: 'tabs.get', chromeArgs: [Number(id)] });
                    if (result.data?.id !== Number(id)) throw new Error('Tab metadata identity mismatch');
                    return { tabId: id, exists: true, verification: 'chrome-tabs-get' };
                } catch (error) {
                    if (String(error?.message).endsWith('No tab with id: ' + id + '.') || String(error?.message).endsWith('No tab with id: ' + id)) return { tabId: id, exists: false, verification: 'chrome-tabs-get-not-found' };
                    throw error;
                }
            }
        });
        const adoptTab = async (id, expectedUrl) => {
            return lifecycle.tabs.adopt(String(id), expectedUrl);
        };
        return { tab: lifecycle.tab, tabs: lifecycle.tabs, userTabs, adoptTab, detailReviews, page, sites: api.sites, recon: api.recon };`;
const patched="import {detailReviewStore} from './hunter-detail-reviews.mjs';\nimport {createAdapterTabLifecycle,createAdapterUserTabs} from './hunter-adapter-tabs.mjs';\n"+original.replace(marker,replacement);
fs.mkdirSync(output,{recursive:false});fs.mkdirSync(path.join(output,'dist/src/runtime'),{recursive:true});
fs.writeFileSync(path.join(output,relative),patched,{flag:'wx'});
fs.mkdirSync(path.join(output,'dist/src/sites'),{recursive:true});
fs.writeFileSync(path.join(output,executorPath),patchedExecutor,{flag:'wx'});
fs.copyFileSync(fileURLToPath(new URL('../compat/adapter-tabs.mjs',import.meta.url)),path.join(output,'dist/src/runtime/hunter-adapter-tabs.mjs'));
fs.copyFileSync(fileURLToPath(new URL('../compat/detail-reviews.mjs',import.meta.url)),path.join(output,'dist/src/runtime/hunter-detail-reviews.mjs'));
const reviewHelper=fs.readFileSync(path.join(output,'dist/src/runtime/hunter-detail-reviews.mjs'));
const helper=fs.readFileSync(path.join(output,'dist/src/runtime/hunter-adapter-tabs.mjs'));
fs.writeFileSync(path.join(output,'patch-manifest.json'),JSON.stringify({upstream:'0.0.30',files:[{path:'dist/src/runtime/hunter-detail-reviews.mjs',originalSha256:null,patchedSha256:hash(reviewHelper)},{path:executorPath,originalSha256:hash(executor),patchedSha256:hash(patchedExecutor)},{path:relative,originalSha256:hash(original),patchedSha256:hash(patched)},{path:'dist/src/runtime/hunter-adapter-tabs.mjs',originalSha256:null,patchedSha256:hash(helper)}],installed:false,scope:'same-site adapter child lifecycle; no extension permission changes'},null,2));
console.log(output);
