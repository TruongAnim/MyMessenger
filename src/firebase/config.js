// Firebase web config for the Love Note project.
//
// These values are NOT secrets — a web API key only identifies the project and
// grants no access on its own. Write access is controlled by Firebase Auth plus
// the Firestore rules in firestore.rules (only OWNER_UID may write).
//
// Where to find them: Firebase Console → Project settings → General →
// Your apps → Web app → SDK setup and configuration → Config.
export const firebaseConfig = {
  apiKey: "AIzaSyDaquU9tgl5yWLFPby-q5nBnxXxjK59sJs",
  authDomain: "love-note-371eb.firebaseapp.com",
  projectId: "love-note-371eb",
  storageBucket: "love-note-371eb.firebasestorage.app",
  messagingSenderId: "515069365859",
  appId: "1:515069365859:web:562a132a38ae7f2d91b256",
  measurementId: "G-GNSR334JG9"
};

// Collection that Love Note reads conversation stats from.
export const STATS_COLLECTION = 'messenger_stats'

export const isConfigured = !Object.values(firebaseConfig).some(
  v => typeof v === 'string' && v.includes('REPLACE_ME')
)
