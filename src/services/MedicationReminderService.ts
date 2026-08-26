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
import {getElderDisplayName, getElderProfile, getElderSelfBackendId} from './ProfileService';
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

// ─── 取得長輩端自己的識別碼 ───────────────────────────────────────────────────

/**
 * 長輩端自己的兩組識別碼：
 * - localKey        本機分區（自己的 pairCode）
 * - backendElderId  後端 Elder UUID（自己的）
 */
async function getElderSelfKeys(): Promise<{localKey: string; backendElderId: string | null}> {
  const [profile, backendElderId] = await Promise.all([
    getElderProfile(),
    getElderSelfBackendId(),
  ]);
  return {localKey: profile?.pairCode ?? 'default', backendElderId};
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
    const {localKey, backendElderId} = await getElderSelfKeys();
    const [meds, taken] = await Promise.all([
      getMedications(localKey, backendElderId),
      getDailyTakenState(localKey),
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
  const {localKey, backendElderId} = await getElderSelfKeys();
  const meds = await getMedications(localKey, backendElderId);
  const med  = meds.find(m => m.id === medId);
  const h    = new Date().getHours();
  const dateKey = (med && isBedtimeMed(med) && h < 1) ? yesterdayDateStr() : todayDateStr();

  await Promise.all([
    markTakenOnDate(medId, dateKey, localKey),
    cancelMedicationNotification(medId),
  ]);

  return getEffectiveTakenState(meds, localKey);
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
 * 家屬端取消服藥記錄。
 * @param localKey        長輩的 pairCode（本機分區用）
 * @param backendElderId  該長輩的後端 Elder UUID（`PairedElder.elderId`），無則傳 null
 */
export async function familyCancelMedicationTaken(
  med: Medication,
  elderName: string,
  localKey: string,
  backendElderId: string | null,
): Promise<DailyTakenState> {
  const now     = new Date();
  const hh      = String(now.getHours()).padStart(2, '0');
  const mm      = String(now.getMinutes()).padStart(2, '0');
  const nowHour = now.getHours();
  const nowMin  = nowHour * 60 + now.getMinutes();

  const dateKey = (isBedtimeMed(med) && nowHour < 1) ? yesterdayDateStr() : todayDateStr();
  await unmarkTakenOnDate(med.id, dateKey, localKey);

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
    }, localKey);
  } else {
    await addFamilyCancelRecord({
      text: `⚠️ 家屬取消了 ${elderName} ${med.time} ${med.name} 的服藥記錄（已超過服藥時間）`,
      at:   `${hh}:${mm}`,
    }, localKey);
  }

  const meds = await getMedications(localKey, backendElderId);
  return getEffectiveTakenState(meds, localKey);
}

// ─── 07:00 sleep-window bundle ────────────────────────────────────────────────

async function checkSleepWindowBundle(): Promise<void> {
  const today = todayDateStr();
  const yd    = yesterdayDateStr();

  if (await hasSleepBundleBeenSent(today)) return;
  await markSleepBundleSent(today);

  const {localKey, backendElderId} = await getElderSelfKeys();
  const meds    = await getMedications(localKey, backendElderId);
  const [ydTaken, ydReminders, todayTaken, todayReminders] = await Promise.all([
    getDailyTakenStateForDate(yd, localKey),
    getDailyReminderStateForDate(yd, localKey),
    getDailyTakenState(localKey),
    getDailyReminderState(localKey),
  ]);

  const missed: {time: string; name: string}[] = [];

  for (const med of meds) {
    if (isBedtimeMed(med)) {
      if (ydTaken[med.id]) continue;
      const state = ydReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSentOnDate(med.id, yd, localKey);
        missed.push({time: med.time, name: med.name});
      }
    } else {
      const [h] = med.time.split(':').map(Number);
      if (h >= 7) continue;
      if (todayTaken[med.id]) continue;
      const state = todayReminders[med.id] ?? {sentAt: null, missedSentAt: null};
      if (!state.missedSentAt) {
        await markMissedSent(med.id, localKey);
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

    const {localKey, backendElderId} = await getElderSelfKeys();
    const [meds, {missedMedicineHours}] = await Promise.all([
      getMedications(localKey, backendElderId),
      getThresholdSettings(),
    ]);

    const missedThresholdMin = missedMedicineHours * 60;
    const [todayTaken, todayReminders] = await Promise.all([
      getDailyTakenState(localKey),
      getDailyReminderState(localKey),
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
        await markMissedSent(med.id, localKey);
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
