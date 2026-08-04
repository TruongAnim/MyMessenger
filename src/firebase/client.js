import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

// Firebase is only needed for the optional sync feature, so everything is
// initialised lazily — the app works fine without it configured.
function app() {
  return getApps()[0] ?? initializeApp(firebaseConfig)
}

export function auth() {
  return getAuth(app())
}

export function db() {
  return getFirestore(app())
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth(), provider)
  return result.user
}

export function signOutUser() {
  return signOut(auth())
}
