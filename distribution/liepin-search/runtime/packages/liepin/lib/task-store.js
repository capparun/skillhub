import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function readFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('任务文件必须是普通文件，不能是符号链接');
  if (stat.size > 100 * 1024 * 1024) throw new Error('任务文件超过 100MB，请分批处理');
  const task = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (task.schemaVersion !== 1 || !task.id || !Array.isArray(task.candidates) || !Array.isArray(task.events)) throw new Error('任务文件格式不受支持');
  return task;
}
export function readTask(file) { return readFile(path.resolve(file)); }

function atomicWrite(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// A lock is deliberately not auto-expired: an interrupted owner needs explicit recovery.
function locked(file, operation) {
  const lock = `${file}.lock`;
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('任务正在写入或上次写入中断；先核对进程和任务文件，不自动抢锁'); throw error; }
  try {
    fs.writeFileSync(fd, JSON.stringify({pid: process.pid, createdAt:new Date().toISOString()}));
    return operation();
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

export function createTask(file, requirements = {}) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), {recursive:true, mode:0o700});
  return locked(resolved, () => {
    if (fs.existsSync(resolved)) throw new Error('任务文件已存在；请读取或继续现有任务，不覆盖');
    const task = { schemaVersion:1, id:crypto.randomUUID(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), status:'draft', requirements, candidates:[], events:[],
      rounds:(requirements.rounds ?? []).map(round => ({...round,status:'planned'})), reviews:[] };
    atomicWrite(resolved, task); return task;
  });
}

export function candidateKey(candidate) {
  if (!candidate || !['liepin','linkedin','maimai'].includes(candidate.source)) throw new Error('缺少受支持的候选人来源');
  const identity = candidate.resumeId || candidate.profileUrl;
  if (typeof identity !== 'string' || !identity.trim()) throw new Error('候选人缺少稳定标识；不能按姓名自动合并');
  return `${candidate.source}:${identity}`;
}

export function mergeObservations(task, observations, {stage, roundId}) {
  if (!['list','detail'].includes(stage) || typeof roundId !== 'string' || !roundId.trim()) throw new Error('必须提供采集阶段和轮次标识');
  if (!Array.isArray(observations)) throw new Error('候选人数据必须为数组');
  const next = structuredClone(task);
  const byKey = new Map(next.candidates.map(c => [c.key,c]));
  for (const data of observations) {
    const key = candidateKey(data);
    const snapshot = JSON.parse(JSON.stringify(data));
    const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    let candidate = byKey.get(key);
    if (!candidate) { candidate={key,source:data.source,identity:data.resumeId || data.profileUrl,observations:[],tags:[]}; byKey.set(key,candidate); }
    if (!candidate.observations.some(o => o.hash===hash && o.stage===stage && o.roundId===roundId)) {
      candidate.observations.push({stage,roundId,capturedAt:new Date().toISOString(),hash,data:snapshot});
    }
  }
  next.candidates = [...byKey.values()];
  next.updatedAt = new Date().toISOString();
  next.events.push({type:'observations_saved',stage,roundId,count:observations.length,at:next.updatedAt});
  return next;
}

// Visible cards sometimes have no stable profile identity. Preserve them as
// unlinked records rather than dropping the search or merging masked names.
// Their local IDs identify observations only, never people or detail targets.
export function mergeListResults(task, rows, {roundId}) {
  if(!Array.isArray(rows) || rows.length>1000)throw new Error('列表结果必须为不超过 1000 条的数组');
  const identified=[],unlinked=[];
  rows.forEach((row,index)=>{
    if(!row || !['liepin','linkedin','maimai'].includes(row.source))throw new Error('列表结果缺少有效来源');
    if(row.resumeId || row.profileUrl)identified.push(row);
    else unlinked.push({row,index});
  });
  const next=mergeObservations(task,identified,{stage:'list',roundId});
  next.unlinkedObservations ??= [];
  for(const {row,index} of unlinked) {
    const data=JSON.parse(JSON.stringify(row));
    const hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const id=crypto.createHash('sha256').update(JSON.stringify({roundId,index,hash})).digest('hex');
    if(!next.unlinkedObservations.some(o=>o.id===id))next.unlinkedObservations.push({
      id,hash,roundId,index,source:row.source,identityStatus:'unresolved',capturedAt:new Date().toISOString(),data,
    });
  }
  if(unlinked.length)next.events.push({type:'unlinked_list_saved',roundId,count:unlinked.length,at:next.updatedAt});
  return next;
}

export function saveObservations(file, observations, context) {
  const resolved = path.resolve(file);
  return locked(resolved, () => {
    const next = mergeObservations(readFile(resolved), observations, context);
    atomicWrite(resolved, next); return next;
  });
}

export function updateTask(file, change) {
  const resolved = path.resolve(file);
  return locked(resolved, () => {
    const next = change(readFile(resolved));
    next.updatedAt = new Date().toISOString();
    atomicWrite(resolved, next); return next;
  });
}
