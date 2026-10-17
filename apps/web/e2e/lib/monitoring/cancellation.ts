/** Next cancels superseded same-origin Server Component navigation fetches. */
export function expectedNavigationCancellation(method: string, url: string, pageUrl: string, rsc: string | undefined, failure: string): boolean {
  if (method !== 'GET' || rsc !== '1' || failure !== 'net::ERR_ABORTED') return false;
  try {
    const target = new URL(url);
    return target.origin === new URL(pageUrl).origin && target.searchParams.has('_rsc');
  } catch { return false; }
}
