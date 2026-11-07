import { describe, expect, it } from 'vitest';
import { workPriority } from './workstream-presentation';
describe('reviewer priority presentation', () => {
  it('marks overdue and risk cases High', () => { expect(workPriority('Overdue')).toBe('High'); expect(workPriority('Risk cases')).toBe('High'); });
  it('marks policy change and replies Medium', () => { expect(workPriority('Policy change')).toBe('Medium'); expect(workPriority('Customer replied')).toBe('Medium'); });
  it('marks near limit and QA Low', () => { expect(workPriority('Near limit')).toBe('Low'); expect(workPriority('QA sample')).toBe('Low'); });
});