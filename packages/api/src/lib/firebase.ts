import { credential } from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import serviceAccount from '../../firebase.json';

const app = initializeApp({
  credential: credential.cert(serviceAccount as unknown as string),
});

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
