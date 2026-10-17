"use client";

// Development-only webpack replacement used by the deterministic browser lane.
// Production and the live E2E lane always load the real Clerk SDK.
import { useEffect, type ReactNode } from 'react';
const getToken = async () => 'e2e-mocked-session';
const email = { emailAddress: 'tester@example.test', verification: { status: 'verified' } };
const user = { id: 'user_e2e', firstName: 'Test', lastName: 'User', fullName: 'Test User', username: 'tester', primaryEmailAddress: email, emailAddresses: [email], imageUrl: '', hasImage: false, passwordEnabled: false, totpEnabled: false, backupCodeEnabled: false, phoneNumbers: [], createdAt: new Date('2026-01-01') };
const clerk = {
  signOut: async () => { window.location.assign('/sign-in'); },
  openUserProfile: () => { window.dispatchEvent(new Event('e2e:profile-opened')); },
};
export function ClerkProvider({ children }: { children: ReactNode }) {
  useEffect(() => { document.documentElement.dataset.e2eHydrated = 'true'; }, []);
  return <>{children}</>;
}
export function useAuth() { return { getToken, isLoaded: true, isSignedIn: true, userId: user.id }; }
export function useUser() { return { user, isLoaded: true, isSignedIn: true }; }
export function useClerk() { return clerk; }
export function SignIn() { return <div>Mock sign-in boundary</div>; }
export function SignUp() { return <div>Mock sign-up boundary</div>; }
export function SignedIn({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SignedOut() { return null; }
export function UserButton() { return <button onClick={clerk.openUserProfile}>Account</button>; }
