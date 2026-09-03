import { Interstitial, InterstitialType, Show } from '../types';

export interface InterstitialConflict {
  interstitial1: Interstitial;
  interstitial2: Interstitial;
  message: string;
}

export interface ShowConflict {
  show1: Show;
  show2: Show;
  message: string;
}

const daysOrderList = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function formatGridRulesSummary(gridRules: string[]): string {
  if (!gridRules || gridRules.length === 0) return '';
  if (gridRules.length === 168) return 'Every hour of every day';
  
  const formatted = gridRules.map(rule => {
    const parts = rule.split('-');
    if (parts.length < 2) return rule;
    const d = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    const dayName = daysOrderList[d] || `Day ${d}`;
    const hStr = h.toString().padStart(2, '0');
    return `${dayName} ${hStr}:00`;
  });

  if (formatted.length <= 3) {
    return formatted.join(', ');
  }
  return `${formatted.slice(0, 3).join(', ')} (+${formatted.length - 3} more timeslots)`;
}

export function getInterstitialConflicts(interstitialsList: Interstitial[]): InterstitialConflict[] {
  const active = interstitialsList.filter(s => s.enabled !== false);
  const conflicts: InterstitialConflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const minA = a.minute || 0;
      const minB = b.minute || 0;
      if (minA !== minB) continue;

      const mStr = minA.toString().padStart(2, '0');

      if (a.type === InterstitialType.BASIC_HOURLY && b.type === InterstitialType.BASIC_HOURLY) {
        conflicts.push({
          interstitial1: a,
          interstitial2: b,
          message: `"${a.name}" and "${b.name}" both start at :${mStr} every hour`
        });
        continue;
      }

      if (
        (a.type === InterstitialType.BASIC_HOURLY && b.type === InterstitialType.ADVANCED) ||
        (b.type === InterstitialType.BASIC_HOURLY && a.type === InterstitialType.ADVANCED)
      ) {
        const adv = a.type === InterstitialType.ADVANCED ? a : b;
        const hly = a.type === InterstitialType.BASIC_HOURLY ? a : b;
        const rules = adv.gridRules || [];
        if (rules.length > 0) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${hly.name}" and "${adv.name}" both start at :${mStr} (${formatGridRulesSummary(rules)})`
          });
        }
        continue;
      }

      if (a.type === InterstitialType.ADVANCED && b.type === InterstitialType.ADVANCED) {
        const rulesA = new Set(a.gridRules || []);
        const commonRules = (b.gridRules || []).filter(r => rulesA.has(r));
        if (commonRules.length > 0) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${a.name}" and "${b.name}" both start at :${mStr} (${formatGridRulesSummary(commonRules)})`
          });
        }
        continue;
      }

      if (a.type === InterstitialType.ONE_TIME && b.type === InterstitialType.ONE_TIME) {
        if (a.date && b.date && a.date === b.date) {
          const hA = parseInt(a.time || '0', 10);
          const hB = parseInt(b.time || '0', 10);
          if (hA === hB) {
            conflicts.push({
              interstitial1: a,
              interstitial2: b,
              message: `"${a.name}" and "${b.name}" both start on ${a.date} at ${hA.toString().padStart(2, '0')}:${mStr}`
            });
          }
        }
        continue;
      }

      const ot = a.type === InterstitialType.ONE_TIME ? a : b.type === InterstitialType.ONE_TIME ? b : null;
      const rec = ot === a ? b : ot === b ? a : null;

      if (ot && rec && ot.date && ot.time) {
        const otHour = parseInt(ot.time, 10);
        const otDayIdx = new Date(`${ot.date}T00:00:00`).getDay();
        const otRule = `${otDayIdx}-${otHour}`;

        if (rec.type === InterstitialType.BASIC_HOURLY) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${otHour.toString().padStart(2, '0')}:${mStr}`
          });
        } else if (rec.type === InterstitialType.ADVANCED) {
          if ((rec.gridRules || []).includes(otRule)) {
            conflicts.push({
              interstitial1: a,
              interstitial2: b,
              message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${otHour.toString().padStart(2, '0')}:${mStr}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function getShowConflicts(showsList: Show[]): ShowConflict[] {
  const active = showsList.filter(s => s.active !== false);
  const conflicts: ShowConflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const dayIdxA = daysOrderList.indexOf(a.day as any);
      const dayIdxB = daysOrderList.indexOf(b.day as any);
      if (dayIdxA === -1 || dayIdxB === -1) continue;

      const startA = dayIdxA * 1440 + a.startHour * 60 + (a.startMinute || 0);
      const durA = (a.durationHours || 0) * 60 + (a.durationMinutes || 0);
      const startB = dayIdxB * 1440 + b.startHour * 60 + (b.startMinute || 0);
      const durB = (b.durationHours || 0) * 60 + (b.durationMinutes || 0);

      if (durA <= 0 || durB <= 0) continue;

      const endA = startA + durA;
      const intervalsA = endA <= 10080 
        ? [{ s: startA, e: endA }] 
        : [{ s: startA, e: 10080 }, { s: 0, e: endA - 10080 }];

      const endB = startB + durB;
      const intervalsB = endB <= 10080 
        ? [{ s: startB, e: endB }] 
        : [{ s: startB, e: 10080 }, { s: 0, e: endB - 10080 }];

      for (const iA of intervalsA) {
        for (const iB of intervalsB) {
          const ovStart = Math.max(iA.s, iB.s);
          const ovEnd = Math.min(iA.e, iB.e);

          if (ovStart < ovEnd) {
            const dIdx = Math.floor(ovStart / 1440);
            const sH = Math.floor((ovStart % 1440) / 60).toString().padStart(2, '0');
            const sM = ((ovStart % 1440) % 60).toString().padStart(2, '0');
            const eH = Math.floor((ovEnd % 1440) / 60).toString().padStart(2, '0');
            const eM = ((ovEnd % 1440) % 60).toString().padStart(2, '0');
            const dayName = daysOrderList[dIdx] || `Day ${dIdx}`;

            conflicts.push({
              show1: a,
              show2: b,
              message: `"${a.name}" and "${b.name}" overlap on ${dayName} from ${sH}:${sM} to ${eH}:${eM}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}
