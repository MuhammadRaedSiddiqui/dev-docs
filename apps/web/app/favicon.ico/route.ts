// Support browsers that request the conventional path before reading metadata.
export function GET(request: Request) {
  return Response.redirect(new URL('/icon.svg', request.url), 308);
}
