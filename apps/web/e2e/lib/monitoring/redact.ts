/** Keep authentication material out of readable monitoring artifacts. */
export function redactText(text: string): string {
  return text
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/([?&](?:__[^=&\s]*|[^=&\s]*(?:token|secret|password|api[_-]?key)|code|state)=)[^&\s"'<>]+/gi, '$1[redacted]');
}

export function redactUrl(value: string, depth = 0): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const [key, field] of [...url.searchParams]) {
      if (/^__|token|secret|password|api[_-]?key|^(code|state)$/i.test(key)) {
        url.searchParams.set(key, '[redacted]');
      } else if (depth < 3 && /^https?:\/\//i.test(field)) {
        url.searchParams.set(key, redactUrl(field, depth + 1));
      }
    }
    return redactText(url.toString());
  } catch { return redactText(value); }
}
