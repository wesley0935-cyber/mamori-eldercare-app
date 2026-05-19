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
import {getElderDisplayName, getElderProfile} from './ProfileService';
import {getThresholdSettings} from './ThresholdSettingsService';

const CHECK_INTERVAL_MS = 60_000;

let _trackingDate = todayDateStr();

export function medicationNotifId(medId: string): string {
  return `medicine_${medId}_${todayDateStr()}`;
}

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

// ─── 取得長輩端自己的 elderId ─────────────────────────────────────────────────

async function getElderSelfId(): Promise<string> {
  const profile = await getElderProfile();
  return profile?.pairCode ?? 'default';
}

// ─── Trigger notification scheduling ─────────────────────────────────────────

async function scheduleOne(med: Medication): Promise<void> {
  const [h, m] = med.time.split(':').map(Number);
  const fireAt = new Date();
  fireAt.setHours(h, m, 0, 0);
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

export async function scheduleTodayMedicationReminders(): Promise<void> {
  try {
    await cancelStaleMedicationNotifications();
    const elderId = await getElderSelfId();
    const [meds, taken] = await Promise.all([
      getMedications(elderId),
      getDailyTakenState(elderId),
    ]);
    for (const med of meds) {
      if (taken[med.id]) continue;
      await scheduleOne(med).catch(e =>
        console.warn('[MedReminder] scheduleOne failed:', med.id, e),
      );
    }
  } catch (e) {
    console.warn('[MedReminder] scheduleTodayMedicationReminders error:', e);
  }
}

export async function cancelMedicationNotification(medId: string): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(medicationNotifId(medId));
  } catch (e) {
    console.warn('[MedReminder] cancelMedicationNotification error:', e);
  }
}

export async function confirmMedicationTaken(medId: string): Promise<DailyTakenState> {
  const elderId = await getElderSelfId();
  const meds = await getMedications(elderId);
  const med  = meds.find(m => m.id === medId);
  const h    = new Date().getHours();
  const dateKey = (med && isBedtimeMed(med) && h < 1) ? yesterdayDateStr() : todayDateStr();

  await Promise.all([
    markTakenOnDate(medId, dateKey, elderId),
    cancelMedicationNotification(medId),
  ]);

  return getEffectiveTakenState(meds, elderId);
}

// ─── Family cancel ────────────────────────────────────────────────────────────

const CANCEL_BUFFER_MIN = 15;

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
    await notifee.displayNotification({
      title: '💊 服藥提醒',
      body,
      android: {channelId: CH_MEDICATION, pressAction: {id: 'default'}, smallIcon: '@mipmap/ic_launcher'},
    });
  }
}

/**
 * 家屬端取消服藥記錄，需傳入 elderId（長輩的 pairCode）
 */
export async function familyCancelMedicationTaken(
  med: Medication,
  elderName: string,
  elderId: string = 'default',
): Promise<DailyTakenState> {
  const now     = new Date();
  const hh      = String(now.getHours()).padStart(2, '0');
  const mm      = String(now.getMinutes()).padStart(2, '0');
  const nowHour = now.getHours();
  const nowMin  = nowHour * 60 + now.getMinutes();

  const dateKey = (isBedtimeMed(med) && nowHour < 1) ? yesterdayDateStr() : todayDateStr();
  await unmarkTakenOnDate(med.id, dateKey, elderId);

  const [mh, mmin] = med.time.split(':').map(Number);
  const medMin     = mh * 60 + mmin;
  const diff       = nowMin - medMin;
  const inWindow   = diff >= -CANCEL_BUFFER_MIN && diff <= CANCEL_BUFFER_MIN;

  if (inWindow) {
    await rescheduleAfterCancel(med).catch(e =>
      console.warn('[MedReminder] rescheduleAfterCancel error:', e),
    );
    await addFamilyCancelRecord({
      text: `⚠️ 家屬取消了 ${elderName} ${med.time} ${med.name} 的服藥記錄`,
      at:   `${hh}:${mm}`,
    }, elderId);
  } else {
    await addFamilyCancelRecord({
      text: `⚠️ 家屬取消了 ${elderName} ${med.time} ${med.name} 的服藥記錄（已超過服藥時間）`,
      at:   `${hh}:${mm}`,
    }, elderId);
  }

  const meds = await getMedications(elderId);
  return getEffectiveTakenState(meds, elderId);
}

// ─── 07:00 sleep-window bundle ────────────────────────────────────────────────

async function checkSleepWindowBundle(): Promise<void> {
  const today = todayDateStr();
  const yd    = yesterdayDateStr();

  if (await hasSleepBundleBeenSent(today)) return;
  await markSleepBundleSent(today);

  const elderId = await getElderSelfId();
  const meds    = await getMedications(elderId);
  const [ydTaken, ydReminders, todayTaken, todayReminders] = await Promise.all([
    getDailyTakenStateForDate(yd, elderId),
    getDailyReminderStateForDate(yd, elderId),
    getDailyTakenState(elderId),
    getDailyReminderState(elderId),
  ]);

  const missed: {time: string; name: string}[] = [];

  for (const med of meds) {
    if (isBedtimeMed(med)) {
      if (ydTaken[med.id]) continue;
      const state = ydReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSentOnDate(med.id, yd, elderId);
        missed.push({time: med.time, name: med.name});
      }
    } else {
      const [h] = med.time.split(':').map(Number);
      if (h >= 7) continue;
      if (todayTaken[med.id]) continue;
      const state = todayReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSent(med.id, elderId);
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
    const dateStr = todayDateStr();
    if (dateStr !== _trackingDate) {
      _trackingDate = dateStr;
      await scheduleTodayMedicationReminders();
    }

    const now         = new Date();
    const nowHour     = now.getHours();
    const nowMinOfDay = nowHour * 60 + now.getMinutes();
    const inSleepWindow = nowHour >= 23 || nowHour < 7;

    if (nowHour === 7) {
      await checkSleepWindowBundle();
    }

    if (inSleepWindow) return;

    const elderId = await getElderSelfId();
    const [meds, {missedMedicineHours}] = await Promise.all([
      getMedications(elderId),
      getThresholdSettings(),
    ]);

    const missedThresholdMin = missedMedicineHours * 60;
    const [todayTaken, todayReminders] = await Promise.all([
      getDailyTakenState(elderId),
      getDailyReminderState(elderId),
    ]);

    let elderName: string | null = null;
    const getName = async () => {
      if (elderName === null) elderName = await getElderDisplayName();
      return elderName;
    };

    for (const med of meds) {
      if (isBedtimeMed(med)) continue;
      if (todayTaken[med.id]) continue;

      const [h, m] = med.time.split(':').map(Number);
      const medMinOfDay = h * 60 + m;
      const state = todayReminders[med.id] ?? {sentAt: null, missedSentAt: null};

      if (nowMinOfDay >= medMinOfDay + missedThresholdMin && !state.missedSentAt) {
        await markMissedSent(med.id, elderId);
        sendMissedMedicine(await getName(), med.time, med.name);
      }
    }
  } catch (e) {
    console.warn('[MedReminder] checkMissed error:', e);
  }
}

export function startMedicationReminder(): () => void {
  _trackingDate = todayDateStr();
  scheduleTodayMedicationReminders().catch(console.error);

  checkMissed().catch(console.error);
  const id = setInterval(() => checkMissed().catch(console.error), CHECK_INTERVAL_MS);
  return () => clearInterval(id);
}
