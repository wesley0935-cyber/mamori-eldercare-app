import notifee, {TriggerType} from '@notifee/react-native';
import {
  getMedications,
  getDailyTakenState,
  getDailyTakenStateForDate,
  getDailyReminderState,
  getDailyReminderStateForDate,
  getEffectiveTakenState,
  markTakenOnDate,
  unmarkTakenOnDate,
  markMissedSent,
  markMissedSentOnDate,
  hasSleepBundleBeenSent,
  markSleepBundleSent,
  addFamilyCancelRecord,
  isBedtimeMed,
  todayDateStr,
  yesterdayDateStr,
  PERIOD_LABELS,
  type Medication,
  type DailyTakenState,
} from './MedicationStorageService';
import {
  CH_MEDICATION,
  sendMissedMedicine,
  sendSleepWindowMissedBundle,
} from './NotificationService';
import {getElderDisplayName} from './ProfileService';
import {getThresholdSettings} from './ThresholdSettingsService';

const CHECK_INTERVAL_MS = 60_000;

// ─── Notification ID ──────────────────────────────────────────────────────────
// todayDateStr() is imported from MedicationStorageService

// ─── Day-change tracking (midnight reset) ─────────────────────────────────────

let _trackingDate = todayDateStr();

/**
 * Canonical notification ID for one medication's daily reminder.
 * Format: medicine_{medId}_{YYYY-MM-DD}
 * Using the date makes IDs day-scoped so yesterday's cancelled IDs never collide.
 */
export function medicationNotifId(medId: string): string {
  return `medicine_${medId}_${todayDateStr()}`;
}

// ─── Stale notification cleanup ───────────────────────────────────────────────

/**
 * Cancels any pending trigger notifications with a `medicine_` prefix whose
 * date suffix doesn't match today.  Safe to call multiple times (idempotent).
 */
async function cancelStaleMedicationNotifications(): Promise<void> {
  try {
    const today   = todayDateStr();
    const pending = await notifee.getTriggerNotifications();
    const staleIds = pending
      .filter(n => {
        const id = n.notification.id;
        return typeof id === 'string' &&
               id.startsWith('medicine_') &&
               !id.endsWith(today);
      })
      .map(n => n.notification.id as string);
    await Promise.all(staleIds.map(id => notifee.cancelTriggerNotification(id)));
  } catch (e) {
    console.warn('[MedReminder] cancelStaleMedicationNotifications error:', e);
  }
}

// ─── Trigger notification scheduling ─────────────────────────────────────────

async function scheduleOne(med: Medication): Promise<void> {
  const [h, m] = med.time.split(':').map(Number);
  const fireAt = new Date();
  fireAt.setHours(h, m, 0, 0);

  // Don't schedule if the time has already passed today
  if (fireAt.getTime() <= Date.now()) return;

  const context = med.note || PERIOD_LABELS[med.period];

  await notifee.createTriggerNotification(
    {
      id:   medicationNotifId(med.id),
      title: '💊 服藥提醒',
      body:  `${med.name} 該服藥了！（${context} ${med.time}）`,
      android: {
        channelId:   CH_MEDICATION,
        pressAction: {id: 'default'},
        smallIcon:   '@mipmap/ic_launcher',
      },
    },
    {
      type:      TriggerType.TIMESTAMP,
      timestamp: fireAt.getTime(),
    },
  );
}

/**
 * Schedules today's pending medication trigger notifications.
 * Only creates notifications for medications that:
 *   (a) have not been taken yet today, and
 *   (b) have a scheduled time still in the future.
 *
 * Call on app start and whenever the medication list changes.
 */
export async function scheduleTodayMedicationReminders(): Promise<void> {
  try {
    await cancelStaleMedicationNotifications();
    const [meds, taken] = await Promise.all([getMedications(), getDailyTakenState()]);
    for (const med of meds) {
      if (taken[med.id]) continue; // already taken — skip
      await scheduleOne(med).catch(e =>
        console.warn('[MedReminder] scheduleOne failed:', med.id, e),
      );
    }
  } catch (e) {
    console.warn('[MedReminder] scheduleTodayMedicationReminders error:', e);
  }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

/**
 * Cancels the pending trigger notification for a specific medication today.
 *
 * Timing safety:
 *   07:45 (early)   → notification still pending at 08:00 → cancelled ✓
 *   08:00 (on time) → notification in the same minute     → cancelled ✓
 *   09:00 (late)    → notification already delivered      → no-op (safe) ✓
 */
export async function cancelMedicationNotification(medId: string): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(medicationNotifId(medId));
  } catch (e) {
    console.warn('[MedReminder] cancelMedicationNotification error:', e);
  }
}

/**
 * Marks a medication as taken AND immediately cancels its pending reminder.
 * Use this from the elder UI instead of calling markTaken() directly.
 *
 * Bedtime meds (period='bedtime' or time 21:00-23:59) taken between 00:00-00:59
 * are attributed to the previous calendar day so the correct daily record is updated.
 *
 * Returns the effective taken state (merges yesterday's bedtime records when in the
 * midnight grace window) so the UI always shows the right checkmark state.
 */
export async function confirmMedicationTaken(medId: string): Promise<DailyTakenState> {
  const meds = await getMedications();
  const med  = meds.find(m => m.id === medId);
  const h    = new Date().getHours();
  // Bedtime grace window (00:00–00:59): attribute the check-mark to yesterday
  const dateKey = (med && isBedtimeMed(med) && h < 1) ? yesterdayDateStr() : todayDateStr();

  await Promise.all([
    markTakenOnDate(medId, dateKey),
    cancelMedicationNotification(medId),
  ]);

  return getEffectiveTakenState(meds);
}

// ─── Family cancel: unmark + conditional reschedule ──────────────────────────

const CANCEL_BUFFER_MIN = 15;

/**
 * Sends the "reset by family" reminder to the elder.
 * Future scheduled time → trigger notification (fires at original med time).
 * Past but within buffer → immediate displayNotification.
 */
async function rescheduleAfterCancel(med: Medication): Promise<void> {
  const [h, m] = med.time.split(':').map(Number);
  const fireAt = new Date();
  fireAt.setHours(h, m, 0, 0);

  const body = `${med.name} 請記得服藥！家屬已幫您重置記錄`;

  if (fireAt.getTime() > Date.now()) {
    await notifee.createTriggerNotification(
      {
        id:    medicationNotifId(med.id),
        title: '💊 服藥提醒',
        body,
        android: {channelId: CH_MEDICATION, pressAction: {id: 'default'}, smallIcon: '@mipmap/ic_launcher'},
      },
      {type: TriggerType.TIMESTAMP, timestamp: fireAt.getTime()},
    );
  } else {
    // Scheduled time already passed but within 15-min buffer → send now
    await notifee.displayNotification({
      title: '💊 服藥提醒',
      body,
      android: {channelId: CH_MEDICATION, pressAction: {id: 'default'}, smallIcon: '@mipmap/ic_launcher'},
    });
  }
}

/**
 * Called when a family member cancels an elder's medication check-mark.
 *
 * Situation A — within ±15 min of scheduled time:
 *   • Unmarks the medication
 *   • Reschedules / sends the reminder to the elder device
 *   • Logs: "家屬取消了 [name] HH:MM [med] 的服藥記錄"
 *
 * Situation B — more than 15 min past scheduled time:
 *   • Unmarks the medication
 *   • Does NOT send a reminder (window has passed)
 *   • Logs: "家屬取消了 [name] HH:MM [med] 的服藥記錄（已超過服藥時間）"
 *
 * Returns the updated DailyTakenState for immediate UI refresh.
 */
export async function familyCancelMedicationTaken(
  med: Medication,
  elderName: string,
): Promise<DailyTakenState> {
  const now    = new Date();
  const hh     = String(now.getHours()).padStart(2, '0');
  const mm     = String(now.getMinutes()).padStart(2, '0');
  const nowHour = now.getHours();
  const nowMin = nowHour * 60 + now.getMinutes();

  // Bedtime meds taken between 00:00-00:59 were written to yesterday's record
  const dateKey = (isBedtimeMed(med) && nowHour < 1) ? yesterdayDateStr() : todayDateStr();
  await unmarkTakenOnDate(med.id, dateKey);

  const [mh, mmin] = med.time.split(':').map(Number);
  const medMin     = mh * 60 + mmin;
  const diff       = nowMin - medMin;
  const inWindow   = diff >= -CANCEL_BUFFER_MIN && diff <= CANCEL_BUFFER_MIN;

  if (inWindow) {
    // ── Situation A ──────────────────────────────────────────────────────────
    await rescheduleAfterCancel(med).catch(e =>
      console.warn('[MedReminder] rescheduleAfterCancel error:', e),
    );
    await addFamilyCancelRecord({
      text: `⚠️ 家屬取消了 ${elderName} ${med.time} ${med.name} 的服藥記錄`,
      at:   `${hh}:${mm}`,
    });
  } else {
    // ── Situation B ──────────────────────────────────────────────────────────
    await addFamilyCancelRecord({
      text: `⚠️ 家屬取消了 ${elderName} ${med.time} ${med.name} 的服藥記錄（已超過服藥時間）`,
      at:   `${hh}:${mm}`,
    });
  }

  const meds = await getMedications();
  return getEffectiveTakenState(meds);
}

// ─── Polling: missed medication check ────────────────────────────────────────
// Trigger notifications handle the on-time reminder.
// This loop only checks for medications that are overdue and not yet alerted.
//
// Sleep-window logic (23:00–06:59):
//   睡眠時段的服藥未打勾延遲到 07:00 通知
//   避免半夜打擾家屬
//
// Bedtime med timeline (21:00–23:59 or period='bedtime'):
//   21:00–23:59  Trigger notification fires on elder's device (scheduleOne).
//   00:00–00:59  Grace window — elder may still check in (written to yesterday's record).
//   01:00–06:59  Sleep window — suppress alert; will be included in 07:00 bundle.
//   07:00        Bundle fires: check yesterday's record, alert if still not taken.
//   07:01–22:59  Daytime — bedtime meds already handled by bundle; skip.
//
// Regular med timeline (07:00–22:59 scheduled):
//   threshold    Immediate alert after missedMedicineHours (daytime only).
//   23:00–06:59  Sleep window — any regular med with time in this range is bundled at 07:00.

// ─── 07:00 sleep-window bundle ────────────────────────────────────────────────

async function checkSleepWindowBundle(): Promise<void> {
  const today = todayDateStr();
  const yd    = yesterdayDateStr();

  // 睡眠時段的服藥未打勾延遲到 07:00 通知
  // 避免半夜打擾家屬
  if (await hasSleepBundleBeenSent(today)) return;

  // Mark sent immediately to prevent double-dispatch on rapid re-ticks
  await markSleepBundleSent(today);

  const meds = await getMedications();
  const [ydTaken, ydReminders, todayTaken, todayReminders] = await Promise.all([
    getDailyTakenStateForDate(yd),
    getDailyReminderStateForDate(yd),
    getDailyTakenState(),
    getDailyReminderState(),
  ]);

  const missed: {time: string; name: string}[] = [];

  for (const med of meds) {
    if (isBedtimeMed(med)) {
      // Bedtime meds: taken record is in yesterday's storage (grace window attribution)
      if (ydTaken[med.id]) continue;
      const state = ydReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSentOnDate(med.id, yd);
        missed.push({time: med.time, name: med.name});
      }
    } else {
      // Regular meds scheduled in 00:00–06:59 (unusual nocturnal meds)
      const [h] = med.time.split(':').map(Number);
      if (h >= 7) continue; // daytime meds are handled by immediate alerts
      if (todayTaken[med.id]) continue;
      const state = todayReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSent(med.id);
        missed.push({time: med.time, name: med.name});
      }
    }
  }

  if (missed.length > 0) {
    const name = await getElderDisplayName();
    sendSleepWindowMissedBundle(name, missed);
  }
}

// ─── Main missed-check loop ───────────────────────────────────────────────────

async function checkMissed(): Promise<void> {
  try {
    // Detect day change (app running past midnight)
    const dateStr = todayDateStr();
    if (dateStr !== _trackingDate) {
      _trackingDate = dateStr;
      await scheduleTodayMedicationReminders();
    }

    const now         = new Date();
    const nowHour     = now.getHours();
    const nowMinOfDay = nowHour * 60 + now.getMinutes();

    // 睡眠時段的服藥未打勾延遲到 07:00 通知
    // 避免半夜打擾家屬
    const inSleepWindow = nowHour >= 23 || nowHour < 7;

    // At 07:00: dispatch the overnight bundle before resuming daytime checks
    if (nowHour === 7) {
      await checkSleepWindowBundle();
    }

    // During sleep window: suppress all immediate missed alerts
    if (inSleepWindow) return;

    // ── Daytime (07:01–22:59): immediate alert for regular overdue meds ────────
    const [meds, {missedMedicineHours}] = await Promise.all([
      getMedications(),
      getThresholdSettings(),
    ]);

    const missedThresholdMin = missedMedicineHours * 60;
    const [todayTaken, todayReminders] = await Promise.all([
      getDailyTakenState(),
      getDailyReminderState(),
    ]);

    let elderName: string | null = null;
    const getName = async () => {
      if (elderName === null) elderName = await getElderDisplayName();
      return elderName;
    };

    for (const med of meds) {
      // Bedtime meds are fully handled by the 07:00 sleep-window bundle
      if (isBedtimeMed(med)) continue;

      if (todayTaken[med.id]) continue;

      const [h, m] = med.time.split(':').map(Number);
      const medMinOfDay = h * 60 + m;
      const state = todayReminders[med.id] ?? {sentAt: null, missedSentAt: null};

      if (nowMinOfDay >= medMinOfDay + missedThresholdMin && !state.missedSentAt) {
        await markMissedSent(med.id);
        sendMissedMedicine(await getName(), med.time, med.name);
      }
    }
  } catch (e) {
    console.warn('[MedReminder] checkMissed error:', e);
  }
}

/**
 * Starts the medication reminder service.
 *
 * On start:
 *   • Schedules today's pending medication trigger notifications.
 *   • Begins polling every 60 s for overdue (missed) medication alerts.
 *
 * Trigger notifications fire at exact scheduled times and are cancelled
 * immediately if the elder marks the medication as taken before the time.
 *
 * Returns a cleanup function; call it when the host component unmounts.
 */
export function startMedicationReminder(): () => void {
  _trackingDate = todayDateStr();
  scheduleTodayMedicationReminders().catch(console.error);

  checkMissed().catch(console.error);
  const id = setInterval(() => checkMissed().catch(console.error), CHECK_INTERVAL_MS);
  return () => clearInterval(id);
}
