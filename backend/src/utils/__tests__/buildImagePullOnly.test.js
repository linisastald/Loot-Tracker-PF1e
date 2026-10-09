/**
 * Static check of build_image.sh (never executed): --pull-only must not report
 * success when the pull fails (Opus review 2026-10-06, L-5).
 */
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '../../../../build_image.sh'), 'utf8').split(/\r?\n/);

describe('build_image.sh --pull-only', () => {
  const start = script.findIndex(line => line.includes('if [ "$PULL_ONLY" = true ]'));
  const block = script.slice(start, script.findIndex((line, i) => i > start && /^fi\s*$/.test(line)) + 1).join('\n');

  it('exits non-zero with a clear message when the pull fails, before printing "Pull complete"', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/if ! git pull --ff-only origin "\$GIT_BRANCH"; then[\s\S]*ERROR[\s\S]*exit 1[\s\S]*fi/);
    expect(block.indexOf('exit 1')).toBeLessThan(block.indexOf('Pull complete'));
  });
});
