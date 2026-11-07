import type { WorkItem } from './reviewer-workstream';

export const WORK_TABS = ['Overdue', 'Customer replied', 'Risk cases', 'Policy change', 'Near limit', 'QA sample'] as const;
export type WorkTab = typeof WORK_TABS[number];
export function workTab(item: WorkItem): WorkTab {
  if (item.group === 'no_reply') return 'Overdue';
  if (item.replied) return 'Customer replied';
  if (item.group === 'policy_change') return 'Policy change';
  if (item.group === 'double_check') return item.nearLimit ? 'Near limit' : 'QA sample';
  return 'Risk cases';
}
export function workPriority(tab: WorkTab) {
  return tab === 'Overdue' || tab === 'Risk cases' ? 'High' : tab === 'Policy change' || tab === 'Customer replied' ? 'Medium' : 'Low';
}