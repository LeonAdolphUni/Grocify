/** Persistenz für den Wochenplan. Ein Plan zur Zeit — mehr braucht es nicht. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyWeek, type WeekPlan } from '../domain/weekPlan';

const KEY = 'grocify.weekplan.v1';

export async function loadWeekPlan(): Promise<WeekPlan | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeekPlan;
    // Ein unvollständig gespeicherter Plan darf die App nicht lahmlegen:
    // fehlende Tage werden ergänzt statt zu einem Absturz zu führen.
    return { ...emptyWeek(parsed.id, parsed.name), ...parsed, days: { ...emptyWeek('').days, ...parsed.days } };
  } catch {
    return null;
  }
}

export async function saveWeekPlan(plan: WeekPlan): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(plan));
}

export async function clearWeekPlan(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
