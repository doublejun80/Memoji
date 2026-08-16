import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function run(tag: string) {
  return spawnSync(process.execPath, ['scripts/verify-release-version.mjs', '--tag', tag], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('release version tags', () => {
  it('accepts the GA tag for the current application version', () => {
    expect(run('v2.0.0').status).toBe(0);
  });

  it('accepts numbered release-candidate tags for the current application version', () => {
    expect(run('v2.0.0-rc.1').status).toBe(0);
  });

  it('rejects release-candidate tags for a different application version', () => {
    expect(run('v2.0.1-rc.1').status).not.toBe(0);
  });

  it('rejects prerelease channels that are not the approved RC format', () => {
    expect(run('v2.0.0-beta.1').status).not.toBe(0);
  });
});
