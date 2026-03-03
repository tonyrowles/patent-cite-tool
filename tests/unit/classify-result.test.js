import { classifyResult } from '../helpers/classify-result.js';

describe('classifyResult', () => {
  it('returns exact for identical same-column citations', () => {
    const result = classifyResult('4:15-20', '4:15-20');
    expect(result).toEqual({ tier: 'exact', detail: null });
  });

  it('returns systematic when both start and end off by same +1 amount', () => {
    const result = classifyResult('4:15-20', '4:16-21');
    expect(result.tier).toBe('systematic');
    expect(result.detail).toContain('delta=+1');
  });

  it('returns boundary when only start is off by +1', () => {
    const result = classifyResult('4:15-20', '4:16-20');
    expect(result.tier).toBe('boundary');
    expect(result.detail).toContain('delta_start=+1');
    expect(result.detail).toContain('delta_end=0');
  });

  it('returns mismatch when delta >= 2', () => {
    const result = classifyResult('4:15-20', '4:18-25');
    expect(result.tier).toBe('mismatch');
    expect(result.detail).toContain('delta_start=3');
    expect(result.detail).toContain('delta_end=5');
  });

  it('returns mismatch on column difference', () => {
    const result = classifyResult('4:15-20', '5:15-20');
    expect(result.tier).toBe('mismatch');
    expect(result.detail).toBe('column mismatch');
  });

  it('returns exact for identical cross-column citations', () => {
    const result = classifyResult('3:45-4:5', '3:45-4:5');
    expect(result).toEqual({ tier: 'exact', detail: null });
  });

  it('returns systematic for cross-column citation shifted +1', () => {
    const result = classifyResult('3:45-4:5', '3:46-4:6');
    expect(result.tier).toBe('systematic');
    expect(result.detail).toContain('delta=+1');
  });

  it('returns mismatch when either citation is null', () => {
    expect(classifyResult(null, '4:15-20').tier).toBe('mismatch');
    expect(classifyResult('4:15-20', null).tier).toBe('mismatch');
    expect(classifyResult(null, null).tier).toBe('mismatch');
  });

  it('returns mismatch for unparseable citation', () => {
    expect(classifyResult('bad-format', '4:15-20').tier).toBe('mismatch');
  });
});
