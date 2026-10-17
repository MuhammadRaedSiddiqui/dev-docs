// middleware.ts
// Clerk authentication middleware
// Protects routes and manages authentication redirects automatically

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback(.*)',
]);

const authenticatedMiddleware = clerkMiddleware(async (auth, request) => {
  // Protect all routes except public ones
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

// Only a locally started development test server may bypass Clerk. Request
// headers can never enable this, and production always verifies authentication.
export default function middleware(...args: Parameters<typeof authenticatedMiddleware>) {
  if (process.env.NODE_ENV === 'development' && process.env.PLAYWRIGHT === '1') return;
  return authenticatedMiddleware(...args);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
