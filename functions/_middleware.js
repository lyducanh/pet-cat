// Visit log, done on the server (Cloudflare Pages Functions).
// Every time someone opens the page, Cloudflare records it in Supabase before the
// page reaches the browser, so the page itself has no logging code to see or call.
//
// Needs two settings in Cloudflare -> Workers & Pages -> pet-cat -> Settings -> Variables and Secrets:
//   SUPABASE_URL         https://sgmgnhzqttzdaojdwpit.supabase.co
//   SUPABASE_SECRET_KEY  the sb_secret_... key from Supabase (type: Secret, never put it in the repo)
// The database side is supabase/visits.sql (function record_visit).

const COOKIE = 'petcat_vid';                 // returning-visitor id, HttpOnly so page scripts can't read it
const SKIP_HEADERS = ['cookie', 'authorization'];

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const res = await ctx.next();
  const url = new URL(request.url);

  const isPageOpen =
    request.method === 'GET' &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) &&
    (res.status === 200 || res.status === 304) &&
    !/prefetch|prerender/i.test(request.headers.get('sec-purpose') || '');
  if (!isPageOpen || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return res;

  // same browser coming back = same id
  let vid = ((request.headers.get('cookie') || '').match(/(?:^|;\s*)petcat_vid=([\w-]{8,40})/) || [])[1];
  let out = res;
  if (!vid) {
    vid = crypto.randomUUID();
    out = new Response(res.body, res);
    out.headers.append('Set-Cookie', `${COOKIE}=${vid}; Max-Age=63072000; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }

  // write the row in the background: the visitor doesn't wait for it
  ctx.waitUntil(recordVisit(request, env, url, vid).catch(e => console.log('visit log failed', e)));
  return out;
}

async function recordVisit(request, env, url, vid) {
  const h = request.headers;
  const cf = request.cf || {};

  const headers = {};
  for (const [k, v] of h) if (!SKIP_HEADERS.includes(k)) headers[k] = v;
  const { tlsClientAuth, tlsExportedAuthenticator, ...cfInfo } = cf;   // drop TLS internals

  const key = env.SUPABASE_SECRET_KEY;
  const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/record_visit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      // an old-style service_role key (a JWT) also needs the Authorization header
      ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}),
    },
    body: JSON.stringify({ v: {
      ip: h.get('cf-connecting-ip'),
      country: cf.country || h.get('cf-ipcountry'),
      city: cf.city,
      region: cf.region,
      isp: cf.asOrganization,
      visitor_id: vid,
      path: url.pathname + url.search,
      referrer: h.get('referer'),
      language: (h.get('accept-language') || '').split(',')[0] || null,
      timezone: cf.timezone,
      user_agent: h.get('user-agent'),
      headers,
      cf: cfInfo,
    } }),
  });
  if (!res.ok) console.log('visit log', res.status, await res.text());
}
