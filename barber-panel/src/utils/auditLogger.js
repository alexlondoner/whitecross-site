import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const TENANT = 'tenants/whitecross';

export async function logAudit(action, details = {}) {
  const user = auth.currentUser;
  try {
    await addDoc(collection(db, `${TENANT}/auditLogs`), {
      action,
      userId: user?.uid || '',
      userEmail: user?.email || '',
      userName: user?.displayName || user?.email || '',
      timestamp: serverTimestamp(),
      ...details,
    });
  } catch (_) {}
}
