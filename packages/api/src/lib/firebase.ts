import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp();

const auth = getAuth(app);

async function getCustomClaims(uid: string) {
  try {
    const userRecord = await auth.getUser(uid);
    return userRecord.customClaims;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

export { auth, getCustomClaims };
export default app;
