// Import the functions you need from the SDKs you need
import { getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyCRtzVO1QNOKrGp2U-yOr2Gb5wd1JJx2qA',
  authDomain: 'switchboard-a651a.firebaseapp.com',
  projectId: 'switchboard-a651a',
  storageBucket: 'switchboard-a651a.firebasestorage.app',
  messagingSenderId: '179772756218',
  appId: '1:179772756218:web:583142e0ee7b484eebb943',
  measurementId: 'G-1FLNLYVYCH',
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
