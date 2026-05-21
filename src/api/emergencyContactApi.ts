import apiClient from './client';
import type {EmergencyContact} from '../services/EmergencyContactService';

export const getEmergencyContactsApi = async (
  elderId: string,
): Promise<EmergencyContact[]> => {
  const res = await apiClient.get(`/api/emergency-contacts/${elderId}`);
  return res.data?.contacts ?? [];
};

export const saveEmergencyContactsApi = async (
  elderId: string,
  contacts: EmergencyContact[],
): Promise<void> => {
  await apiClient.post(`/api/emergency-contacts/${elderId}`, {contacts});
};
