// Human-like pacing: variable gaps instead of a fixed cadence.
// Order stays deterministic (resume depends on it); only timing is randomized.
export const PACING_PRESETS = {
  steady: {
    label: '稳健档',
    gapMs: [25000, 45000],
    groupEvery: [6, 10],
    groupPauseMs: [90000, 150000],
    restEvery: [25, 30],
    restPauseMs: [300000, 480000],
  },
  conservative: {
    label: '保守档',
    gapMs: [45000, 90000],
    groupEvery: [6, 10],
    groupPauseMs: [120000, 180000],
    restEvery: [20, 25],
    restPauseMs: [480000, 600000],
  },
  standard: {
    label: '标准档',
    gapMs: [15000, 25000],
    groupEvery: [8, 12],
    groupPauseMs: [60000, 120000],
    restEvery: [30, 35],
    restPauseMs: [240000, 360000],
  },
};

const between = (range, random) => {
  const [low, high] = range;
  return low + Math.floor(random() * (high - low + 1));
};

/**
 * Pacing decides how long to wait before the next profile.
 * The gap is jittered, and every few profiles a longer pause is inserted so the
 * request stream does not form a fixed machine cadence.
 */
export function createPacer({ preset = 'steady', random = Math.random } = {}) {
  const config = PACING_PRESETS[preset] ?? PACING_PRESETS.steady;
  const groupEvery = between(config.groupEvery, random);
  const restEvery = Math.max(groupEvery + 1, between(config.restEvery, random));
  return {
    preset,
    config,
    // index is the 0-based position of the profile about to be read; the first one has no wait.
    delayBefore(index) {
      if (index <= 0) return { ms: 0, kind: 'none' };
      if (index % restEvery === 0) return { ms: between(config.restPauseMs, random), kind: 'rest' };
      if (index % groupEvery === 0) return { ms: between(config.groupPauseMs, random), kind: 'group_pause' };
      return { ms: between(config.gapMs, random), kind: 'gap' };
    },
  };
}
