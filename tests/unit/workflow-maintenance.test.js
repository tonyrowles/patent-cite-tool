import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function workflow(name) {
  return readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
}

describe('maintenance workflow safeguards', () => {
  it('supplies authentication to every nightly and dependency extension build', () => {
    for (const name of ['e2e-nightly', 'v40-deps-update']) {
      const steps = workflow(name).split(/\n      - /);
      const builds = steps.filter(step => /run: npm run (build:chrome|e2e:quarantine)/.test(step));
      expect(builds.length).toBeGreaterThan(0);
      for (const step of builds) {
        expect(step).toContain('PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}');
        expect(step.match(/\n        env:/g)).toHaveLength(1);
      }
    }
  });

  it('retains dependency review reports when Actions cannot create PRs', () => {
    const source = workflow('v40-deps-update');
    expect(source).toContain('can_approve_pull_request_reviews');
    expect(source).toContain('echo "allowed=false"');
    expect(source).toContain('/tmp/dependency-scan.json');
    expect(source.match(/if: steps\.pr-policy\.outputs\.allowed == 'true'/g)).toHaveLength(2);
  });

  it('runs ESLint and Windows builds in CI', () => {
    const source = workflow('ci');
    expect(source).toContain('run: npm run lint');
    expect(source).toContain('runs-on: windows-latest');
    expect(source).toContain('PROXY_TOKEN: test-proxy-token');
    expect(source).toContain('run: npm test');
  });
});
