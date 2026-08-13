import apiClient from './client';

export interface MedicationPayload {
  name: string;
  dosage: string;
  time: string;
  period: string;
  note?: string;
}

export interface MedicationRecord extends MedicationPayload {
  id: string;
  elderId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getMedications(elderId: string): Promise<MedicationRecord[]> {
  try {
    const res = await apiClient.get(`/api/medication/${elderId}`);
    return res.data?.medications ?? [];
  } catch (e) {
    console.warn('[medicationApi] getMedications failed:', e);
    return [];
  }
}

export async function addMedication(
  elderId: string,
  payload: MedicationPayload,
): Promise<MedicationRecord | null> {
  try {
    const res = await apiClient.post(`/api/medication/${elderId}`, payload);
    return res.data?.medication ?? null;
  } catch (e) {
    console.warn('[medicationApi] addMedication failed:', e);
    return null;
  }
}

export async function updateMedication(
  elderId: string,
  medId: string,
  payload: Partial<MedicationPayload>,
): Promise<MedicationRecord | null> {
  try {
    const res = await apiClient.put(`/api/medication/${elderId}/${medId}`, payload);
    return res.data?.medication ?? null;
  } catch (e) {
    console.warn('[medicationApi] updateMedication failed:', e);
    return null;
  }
}

export async function deleteMedication(
  elderId: string,
  medId: string,
): Promise<boolean> {
  try {
    await apiClient.delete(`/api/medication/${elderId}/${medId}`);
    return true;
  } catch (e) {
    console.warn('[medicationApi] deleteMedication failed:', e);
    return false;
  }
}