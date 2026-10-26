export {
  DEFAULT_JD_CONFIG,
  loadJDConfig,
  mapHardRequirementsToFilters,
  downgradeWorkYear,
  getRelaxationOrder,
  HARD_REQUIREMENT_KEYS,
  BONUS_KEYS,
  EXCLUDE_KEYS,
} from './utils/jd-config-schema.js';

export {
  mergeCandidates,
  mergeAndDeduplicate,
} from './utils/merge-candidates.js';

export { generateMarkdownReport, generateCSV, generateJSON, saveOutputs, generateHTMLReport, saveHTMLReport } from './utils/output-formatter.js';

export { analyzeResult, printAnalysis } from './utils/analyze-result.js';

export { evaluateEvidenceCandidate } from './utils/evidence-evaluator.js';
