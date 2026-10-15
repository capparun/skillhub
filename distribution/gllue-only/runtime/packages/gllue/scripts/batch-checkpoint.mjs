import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [action, ...args] = process.argv.slice(2);

function readJson(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`检查点文件不存在: ${file || '(空)'}`);
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readCheckpoint(file) {
  const value = readJson(file);
  validateState(value);
  return value;
}

function writeNew(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function replaceAtomically(file, value) {
  const resolved = path.resolve(file);
  const temporary = `${resolved}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, resolved);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function withLock(file, operation) {
  const lockPath = `${path.resolve(file)}.lock`;
  const ownerToken = crypto.randomUUID();
  let descriptor;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      descriptor = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(descriptor, JSON.stringify({
        pid: process.pid,
        ownerToken,
        createdAt: new Date().toISOString()
      }));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let lock;
      try {
        lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        throw new Error('检查点锁文件损坏，请人工确认没有其他执行器后再清理');
      }
      const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
      let ownerAlive = true;
      if (Number.isSafeInteger(lock.pid) && lock.pid > 0) {
        try {
          process.kill(lock.pid, 0);
        } catch (probeError) {
          ownerAlive = probeError.code !== 'ESRCH';
        }
      }
      if (attempt === 0 && ageMs > 60_000 && !ownerAlive) {
        fs.unlinkSync(lockPath);
        continue;
      }
      throw new Error('检查点正在被另一个执行器更新，请稍后重试');
    }
  }
  try {
    return operation();
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (current.ownerToken === ownerToken) fs.unlinkSync(lockPath);
    } catch {
      // 锁被替换、损坏或已删除时保留现场，绝不删除无法证明属于本进程的锁。
    }
  }
}

function validateState(state) {
  if (state.version !== 1 || !Number.isSafeInteger(state.requestedCount) || state.requestedCount < 1 ||
      !Number.isSafeInteger(state.checkpointSize) || state.checkpointSize < 1 ||
      !Array.isArray(state.candidates) || state.candidates.length > state.requestedCount) {
    throw new Error('检查点结构无效');
  }
  const ids = state.candidates.map(candidate => String(candidate?.id ?? ''));
  if (ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('检查点候选人 ID 无效或重复');
  }
  const completedStatuses = new Set(['read', 'existing_current_run', 'command_failed']);
  for (const candidate of state.candidates) {
    if (!['pending', 'claimed', ...completedStatuses].includes(candidate.status)) {
      throw new Error(`检查点候选人状态无效: ${candidate.status}`);
    }
    if (candidate.status === 'claimed' && !candidate.claimId) throw new Error('已领取候选人缺少 claimId');
    if (completedStatuses.has(candidate.status) &&
        (!Number.isFinite(candidate.durationMs) || candidate.durationMs < 0 ||
         !['complete', 'incomplete', 'unknown'].includes(candidate.projectReadStatus))) {
      throw new Error(`候选人 ${candidate.id} 的完成记录无效`);
    }
    if (candidate.status === 'command_failed' && !String(candidate.error || '').trim()) {
      throw new Error(`候选人 ${candidate.id} 的失败记录缺少原因`);
    }
  }
  const claimed = state.candidates.filter(candidate => candidate.status === 'claimed');
  if (claimed.length) {
    if (!state.activeClaim?.id || claimed.some(candidate => candidate.claimId !== state.activeClaim.id)) {
      throw new Error('检查点活跃领取组不一致');
    }
  } else if (state.activeClaim) {
    throw new Error('检查点存在空的活跃领取组');
  }
}

function validateSearchInput(input, checkpointSize) {
  const requestedCount = Number.isSafeInteger(input.requestedCount) ? input.requestedCount : input.limit;
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1 || !Array.isArray(input.candidates) ||
      input.candidates.length > requestedCount ||
      (input.candidates.length < requestedCount && input.exhausted !== true)) {
    throw new Error('搜索结果数量与批准上限不一致，少于上限时必须有 exhausted=true 证据');
  }
  const conditions = input.searchConditions || {
    fullText: input.fullText,
    scope: input.scope,
    limit: input.limit
  };
  if (!conditions || typeof conditions.fullText !== 'string' || !conditions.fullText.trim() ||
      !['mine', 'accessible'].includes(conditions.scope) ||
      !Number.isSafeInteger(conditions.limit) || conditions.limit !== requestedCount) {
    throw new Error('搜索结果缺少与目标人数一致的实际搜索条件');
  }
  const ids = input.candidates.map(candidate => String(candidate?.id ?? '').trim());
  if (ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error('搜索结果包含缺失或重复候选人 ID');
  }
  if (!Number.isSafeInteger(checkpointSize) || checkpointSize < 1 || checkpointSize > 100) {
    throw new Error('检查点大小必须是 1 到 100 的整数');
  }
  return { ids, conditions, requestedCount };
}

function summary(state) {
  const completed = state.candidates.filter(candidate =>
    ['read', 'existing_current_run', 'command_failed'].includes(candidate.status));
  const pending = state.candidates.filter(candidate => candidate.status === 'pending');
  const claimed = state.candidates.filter(candidate => candidate.status === 'claimed');
  return {
    requestedCount: state.requestedCount,
    completedCount: completed.length,
    successfulReads: completed.filter(candidate => ['read', 'existing_current_run'].includes(candidate.status)).length,
    failedReads: completed.filter(candidate => candidate.status === 'command_failed').length,
    pendingCount: pending.length,
    claimedCount: claimed.length,
    checkpointSize: state.checkpointSize,
    activeClaimId: state.activeClaim?.id || null,
    activeIds: claimed.map(candidate => candidate.id),
    complete: pending.length === 0 && claimed.length === 0
  };
}

if (action === 'init') {
  const [inputPath, checkpointPath, rawSize = '10'] = args;
  if (!inputPath || !checkpointPath) {
    throw new Error('用法：batch-checkpoint.mjs init <search.json> <checkpoint.json> [checkpoint-size]');
  }
  if (fs.existsSync(checkpointPath)) throw new Error(`检查点文件已存在: ${checkpointPath}`);
  const input = readJson(inputPath);
  const checkpointSize = Number(rawSize);
  const { ids, conditions, requestedCount } = validateSearchInput(input, checkpointSize);
  const state = {
    version: 1,
    requestedCount,
    searchConditions: { fullText: conditions.fullText.trim(), scope: conditions.scope, limit: conditions.limit },
    exhausted: input.exhausted === true,
    checkpointSize,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    candidates: ids.map(id => ({ id, status: 'pending' }))
  };
  writeNew(checkpointPath, state);
  console.log(JSON.stringify(summary(state)));
} else if (action === 'claim') {
  const [checkpointPath, worker = 'single-executor'] = args;
  const result = withLock(checkpointPath, () => {
    const state = readCheckpoint(checkpointPath);
    if (state.activeClaim) throw new Error('已有活跃领取组，请先完成或按原 claimId 恢复');
    const pending = state.candidates.filter(candidate => candidate.status === 'pending');
    const selected = pending.slice(0, state.checkpointSize);
    if (!selected.length) return { ...summary(state), claimId: null, ids: [] };
    const claimId = crypto.randomUUID();
    const claimedAt = new Date().toISOString();
    state.activeClaim = { id: claimId, worker: String(worker), claimedAt };
    for (const candidate of selected) Object.assign(candidate, { status: 'claimed', claimId, claimedAt });
    state.updatedAt = claimedAt;
    replaceAtomically(checkpointPath, state);
    return { ...summary(state), claimId, ids: selected.map(candidate => candidate.id) };
  });
  console.log(JSON.stringify(result));
} else if (action === 'record') {
  const [checkpointPath, claimId, candidateId, status, rawDuration, projectReadStatus, error = ''] = args;
  const allowedStatuses = new Set(['read', 'existing_current_run', 'command_failed']);
  const allowedProjectStatuses = new Set(['complete', 'incomplete', 'unknown']);
  const durationMs = Number(rawDuration);
  if (!allowedStatuses.has(status) || !allowedProjectStatuses.has(projectReadStatus) ||
      !Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('记录参数无效');
  }
  if (status === 'command_failed' && !error.trim()) throw new Error('失败记录必须包含错误原因');
  const result = withLock(checkpointPath, () => {
    const state = readCheckpoint(checkpointPath);
    if (!state.activeClaim || state.activeClaim.id !== claimId) throw new Error('claimId 与当前活跃领取组不匹配');
    const candidate = state.candidates.find(item => item.id === String(candidateId));
    if (!candidate) throw new Error(`候选人不属于当前批次: ${candidateId}`);
    if (candidate.status !== 'claimed' || candidate.claimId !== claimId) {
      throw new Error(`候选人 ${candidateId} 已经记录或不属于当前领取组`);
    }
    Object.assign(candidate, {
      status,
      durationMs,
      projectReadStatus,
      completedAt: new Date().toISOString(),
      ...(error.trim() ? { error: error.trim() } : {})
    });
    delete candidate.claimId;
    delete candidate.claimedAt;
    if (!state.candidates.some(item => item.status === 'claimed' && item.claimId === claimId)) {
      delete state.activeClaim;
    }
    state.updatedAt = new Date().toISOString();
    replaceAtomically(checkpointPath, state);
    return summary(state);
  });
  console.log(JSON.stringify(result));
} else if (action === 'status') {
  const [checkpointPath] = args;
  console.log(JSON.stringify(summary(readCheckpoint(checkpointPath))));
} else {
  throw new Error('用法：gllue-batch-checkpoint.mjs <init|claim|record|status> ...');
}
