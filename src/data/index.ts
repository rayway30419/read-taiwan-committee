// 頁面唯一的資料入口（memoized）。

import type { SiteData } from '../core/derive';
import { loadChecked } from './load';

let cache: Promise<SiteData> | undefined;

export function loadSite(): Promise<SiteData> {
  cache ??= loadChecked().then((c) => c.site);
  return cache;
}

export const loadIssues = async () => (await loadSite()).issues;
export const loadActions = async () => (await loadSite()).actions;
export const loadDecisions = async () => (await loadSite()).decisions;
export const loadMeetings = async () => (await loadSite()).meetings;
export const loadRules = async () => (await loadSite()).rules;
export const loadAnnouncements = async () => (await loadSite()).announcements;
export const getIssue = async (id: string) => (await loadSite()).issueById.get(id);
export const getMeeting = async (id: string) => (await loadSite()).meetingById.get(id);
