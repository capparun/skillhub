import fs from 'fs';
import path from 'path';
import os from 'os';

const SOURCING_DIR = path.join(os.homedir(), '.hunter', 'sourcing');

/**
 * 读取最新的寻访结果 JSON
 */
function findLatestResult() {
  if (!fs.existsSync(SOURCING_DIR)) return null;
  const files = fs.readdirSync(SOURCING_DIR)
    .filter(f => f.endsWith('-candidates.json'))
    .map(f => ({
      name: f,
      path: path.join(SOURCING_DIR, f),
      mtime: fs.statSync(path.join(SOURCING_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path || null;
}

/**
 * 分析寻访结果
 * @param {string} filePath - JSON 文件路径，null 则自动找最新的
 * @returns {object} 分析摘要
 */
export function analyzeResult(filePath = null) {
  const targetPath = filePath || findLatestResult();
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { error: '未找到寻访结果文件' };
  }

  const data = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  const { meta, candidates } = data;
  const total = candidates?.length || 0;

  if (total === 0) {
    return {
      file: targetPath,
      meta,
      summary: { total: 0, qualified: 0, passRate: '0%', avgScore: 0, medianScore: 0 },
      diagnosis: '无候选人数据',
      recommendation: '建议放宽筛选条件或更换关键词后重试',
    };
  }

  const scores = candidates.map(c => c.evaluation?.score || 0).sort((a, b) => a - b);
  const qualified = candidates.filter(c => c.evaluation?.qualified).length;
  const passRate = meta?.passRate || (meta?.total > 0 ? Math.round((meta.finalQualified / meta.total) * 100) + '%' : '0%');
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const medianScore = scores[Math.floor(scores.length / 2)];
  const maxScore = scores[scores.length - 1];
  const minScore = scores[0];

  // 风险点统计
  const riskCounts = {};
  for (const c of candidates) {
    for (const r of (c.risks || [])) {
      // 归类风险类型
      let type = '其他';
      if (r.includes('城市')) type = '城市不匹配';
      else if (r.includes('观望')) type = '在职观望';
      else if (r.includes('离职')) type = '离职急寻';
      else if (r.includes('活跃')) type = '活跃时间久';
      else if (r.includes('跳槽')) type = '近期跳槽';
      else if (r.includes('职位')) type = '期望职位偏离';
      riskCounts[type] = (riskCounts[type] || 0) + 1;
    }
  }

  // 硬性失败统计
  const hardFailCounts = {};
  for (const c of candidates) {
    for (const f of (c.evaluation?.hard_failed || [])) {
      hardFailCounts[f] = (hardFailCounts[f] || 0) + 1;
    }
  }

  // 决策建议
  let diagnosis = '';
  let recommendation = '';
  const passRateNum = parseInt(passRate) || 0;

  if (passRateNum >= 50 && qualified >= 5) {
    diagnosis = '配置合理，人才池质量良好';
    recommendation = '可直接用于正式寻访，建议 limit=50 大批量跑';
  } else if (passRateNum >= 30 && qualified >= 3) {
    diagnosis = '条件略严，通过率中等';
    recommendation = '建议微调 JD 配置（如放宽年限或学历）后重试';
  } else if (passRateNum < 20) {
    diagnosis = '硬性条件过滤过多，人才池不足';
    recommendation = '建议将部分 hard_requirements 移至 bonus_items，或放宽关键词';
  } else if (avgScore < 65) {
    diagnosis = '候选人整体匹配度偏低';
    recommendation = '建议优化关键词组合或扩大目标城市范围';
  } else {
    diagnosis = '结果一般，建议根据风险点针对性调整';
    recommendation = '分析风险点分布后决定调整方向';
  }

  return {
    file: targetPath,
    meta,
    summary: {
      total: meta?.total || total,
      unique: meta?.unique || total,
      qualified,
      passRate,
      avgScore,
      medianScore,
      maxScore,
      minScore,
      top3Avg: total >= 3 ? Math.round(candidates.slice(0, 3).reduce((s, c) => s + (c.evaluation?.score || 0), 0) / 3) : avgScore,
    },
    riskDistribution: riskCounts,
    hardFailDistribution: hardFailCounts,
    diagnosis,
    recommendation,
  };
}

/**
 * 打印分析摘要到控制台
 */
export function printAnalysis(analysis) {
  if (analysis.error) {
    console.log(`❌ ${analysis.error}`);
    return;
  }

  const s = analysis.summary;

  console.log('\n' + '='.repeat(60));
  console.log('📊 寻访结果分析');
  console.log('='.repeat(60));
  console.log(`文件: ${analysis.file}`);
  console.log(`职位: ${analysis.meta?.title || '未命名'}`);
  console.log(`策略: ${analysis.meta?.strategy || 'single'} | 轮次: ${analysis.meta?.rounds || 1}`);
  console.log('');
  console.log('┌─────────────────┬────────┐');
  console.log('│ 指标            │ 数值   │');
  console.log('├─────────────────┼────────┤');
  console.log(`│ 累计收集        │ ${String(s.total).padStart(4)}   │`);
  console.log(`│ 去重后          │ ${String(s.unique).padStart(4)}   │`);
  console.log(`│ 最终通过        │ ${String(s.qualified).padStart(4)}   │`);
  console.log(`│ 通过率          │ ${s.passRate.padStart(4)}   │`);
  console.log(`│ 平均分          │ ${String(s.avgScore).padStart(4)}   │`);
  console.log(`│ 中位数          │ ${String(s.medianScore).padStart(4)}   │`);
  console.log(`│ 最高分          │ ${String(s.maxScore).padStart(4)}   │`);
  console.log(`│ Top 3 平均      │ ${String(s.top3Avg).padStart(4)}   │`);
  console.log('└─────────────────┴────────┘');

  if (Object.keys(analysis.riskDistribution).length > 0) {
    console.log('\n⚠️ 风险点分布:');
    for (const [type, count] of Object.entries(analysis.riskDistribution)) {
      console.log(`   ${type}: ${count}人`);
    }
  }

  if (Object.keys(analysis.hardFailDistribution).length > 0) {
    console.log('\n❌ 硬性失败分布:');
    for (const [type, count] of Object.entries(analysis.hardFailDistribution)) {
      console.log(`   ${type}: ${count}人`);
    }
  }

  console.log('\n📋 诊断:');
  console.log(`   ${analysis.diagnosis}`);
  console.log('\n💡 建议:');
  console.log(`   ${analysis.recommendation}`);
  console.log('');
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2] || null;
  const analysis = analyzeResult(filePath);
  printAnalysis(analysis);
}
