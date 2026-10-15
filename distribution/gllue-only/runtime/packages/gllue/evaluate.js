import { cli, Strategy } from '@jackwener/opencli/registry';
import { evaluateEvidenceCandidate } from './lib/evidence-evaluator.js';
import fs from 'node:fs';
import path from 'node:path';

function readInput(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`输入文件不存在: ${filePath || '(空)'}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  if (!data.jbf?.version || !data.jbf?.scoring || !Array.isArray(data.candidates) || !Array.isArray(data.failures)) {
    throw new Error('输入必须包含 jbf.version、jbf.scoring、candidates 和 failures');
  }
  const ids = data.candidates.map(candidate => candidate?.id === undefined || candidate?.id === null
    ? '' : String(candidate.id).trim());
  if (ids.some(id => !id)) throw new Error('每位候选人必须包含候选人 ID');
  if (new Set(ids).size !== ids.length) throw new Error('输入包含重复候选人 ID，拒绝重复计分');
  const hunterIds = data.candidates.map(candidate => String(candidate?.hunterId || '').trim());
  if (hunterIds.some(id => !/^gllue:[^:]+:.+$/.test(id))) throw new Error('每位候选人必须包含租户隔离的 Gllue hunterId');
  if (new Set(hunterIds).size !== hunterIds.length) throw new Error('输入包含重复 hunterId，拒绝重复计分');
  if (data.candidates.some(candidate => candidate?.evaluation !== undefined)) {
    throw new Error('输入包含已有评分；为避免静默替换，请提供未评分候选人');
  }
  return data;
}

cli({
  site: 'gllue',
  name: 'evaluate',
  description: '按已确认的证据规则本地评估 Gllue 标准简历；不访问平台，不授予触达权限',
  access: 'read',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, description: '包含 JBF 评分规则与未评分 candidates 的 JSON 文件' },
    { name: 'output', type: 'string', required: true, description: '新的评分结果 JSON 文件；拒绝覆盖已有文件' }
  ],
  func: async kwargs => {
    if (fs.existsSync(kwargs.output)) throw new Error(`输出文件已存在: ${kwargs.output}`);
    const input = readInput(kwargs.input);
    const candidates = input.candidates.map(candidate => {
      const evaluation = evaluateEvidenceCandidate(candidate, input.jbf.scoring, { jbfVersion: input.jbf.version });
      return { ...candidate, evaluation,
        missingFields: [...new Set([...(candidate.missingFields || []), ...evaluation.missingFields])] };
    });
    const result = {
      ...input,
      candidates,
      shortlistProposal: candidates.filter(candidate => candidate.evaluation.qualified).map(candidate => ({
        id: candidate.hunterId,
        platformCandidateId: String(candidate.id),
        status: 'proposed',
        approvalRequired: true,
        finalShortlist: false,
        score: candidate.evaluation.score,
        candidate: Object.fromEntries(Object.entries({ name: candidate.name, company: candidate.company,
          title: candidate.title, profileUrl: candidate.profileUrl, sourceRecord: candidate.sourceRecord })
          .filter(([, value]) => value !== undefined)),
        evidence: candidate.evaluation.evidence
      })),
      shortlistMeta: { approvalRequired: true, finalShortlist: false,
        note: '评分建议不是最终短名单，须经人工选择' },
      evaluationMeta: {
        mode: 'evidence_rules',
        jbfVersion: input.jbf.version,
        note: '评分只基于已观察证据；不授予触达权限'
      }
    };
    fs.mkdirSync(path.dirname(path.resolve(kwargs.output)), { recursive: true });
    fs.writeFileSync(kwargs.output, JSON.stringify(result, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return {
      total: candidates.length,
      qualified: candidates.filter(candidate => candidate.evaluation.qualified).length,
      pendingEvidence: candidates.filter(candidate => candidate.evaluation.status === 'pending_evidence').length,
      outputPath: kwargs.output
    };
  }
});
