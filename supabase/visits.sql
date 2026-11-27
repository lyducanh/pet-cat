-- Visit log for Pet the Cat.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste all -> Run.
-- Safe to run again: it only adds what is missing and replaces the functions.
--
-- Two ways a visit gets in:
--   record_visit()  called by the Cloudflare server (functions/_middleware.js) with the
--                   secret key, so the page itself has no logging code. Visitors can't call it.
--   log_visit()     the old way: called from the page with the public key. Turn it off at
--                   the bottom of this file once the Cloudflare site works.
-- Visitors can't read, edit or delete the table. See the rows in Table Editor -> visits.

create table if not exists public.visits (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now()
);
alter table public.visits
  add column if not exists ip          text,   -- visitor's IP address
  add column if not exists country     text,   -- 2-letter code, e.g. VN
  add column if not exists city        text,   -- from Cloudflare, e.g. Hanoi
  add column if not exists region      text,   -- province / state
  add column if not exists isp         text,   -- network, e.g. Viettel Group
  add column if not exists browser     text,   -- Chrome, Safari, Cốc Cốc, Zalo app...
  add column if not exists os          text,   -- Windows, macOS, iOS, Android...
  add column if not exists device      text,   -- Desktop, Mobile, Tablet, Bot
  add column if not exists visitor_id  text,   -- random id kept in the browser: same id = same person coming back
  add column if not exists nav         text,   -- navigate = new open, reload = refresh, back_forward (page log only)
  add column if not exists path        text,   -- page and query string
  add column if not exists referrer    text,   -- where they came from (Google, Facebook...)
  add column if not exists language    text,   -- browser language, e.g. vi-VN
  add column if not exists site_lang   text,   -- language of the page: en / vi (page log only)
  add column if not exists timezone    text,   -- e.g. Asia/Ho_Chi_Minh
  add column if not exists screen      text,   -- e.g. 1920x1080 (page log only)
  add column if not exists user_agent  text,   -- full browser string
  add column if not exists headers     jsonb,  -- every request header the server received (keys removed)
  add column if not exists client      jsonb,  -- everything the page sent about the browser and device (page log only)
  add column if not exists cf          jsonb;  -- what Cloudflare knows: location, network, connection
create index if not exists visits_ip_time on public.visits (ip, created_at desc);
create index if not exists visits_time on public.visits (created_at desc);

-- RLS on and no policies: the public key can't touch the table directly.
alter table public.visits enable row level security;
revoke all on table public.visits from anon, authenticated;

-- browser, OS and device from the user agent
create or replace function public.ua_browser(ua text) returns text language sql immutable as $$
  select case
    when ua ~* 'bot|crawler|spider|preview'  then 'Bot'
    when ua ~* 'zalo'                        then 'Zalo app'
    when ua ~* 'fban|fbav|fb_iab'            then 'Facebook app'
    when ua ~* 'instagram'                   then 'Instagram app'
    when ua ~* 'coc_coc'                     then 'Cốc Cốc'
    when ua ~* 'edg/|edga/|edgios/'          then 'Edge'
    when ua ~* 'opr/|opera'                  then 'Opera'
    when ua ~* 'samsungbrowser'              then 'Samsung Internet'
    when ua ~* 'firefox|fxios'               then 'Firefox'
    when ua ~* 'chrome|crios'                then 'Chrome'
    when ua ~* 'safari'                      then 'Safari'
    else 'Other' end $$;
create or replace function public.ua_os(ua text) returns text language sql immutable as $$
  select case
    when ua ~* 'iphone|ipad|ipod'            then 'iOS'
    when ua ~* 'android'                     then 'Android'
    when ua ~* 'windows'                     then 'Windows'
    when ua ~* 'mac os x|macintosh'          then 'macOS'
    when ua ~* 'cros'                        then 'ChromeOS'
    when ua ~* 'linux'                       then 'Linux'
    else 'Other' end $$;
create or replace function public.ua_device(ua text) returns text language sql immutable as $$
  select case
    when ua ~* 'bot|crawler|spider'          then 'Bot'
    when ua ~* 'ipad|tablet' or (ua ~* 'android' and ua !~* 'mobile') then 'Tablet'
    when ua ~* 'mobi|iphone|ipod|android'    then 'Mobile'
    else 'Desktop' end $$;

-- ---------------------------------------------------------------------------
-- record_visit: called by the Cloudflare server with the secret key
-- ---------------------------------------------------------------------------
create or replace function public.record_visit(v jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := left(v->>'ip', 60);
  ua   text := left(coalesce(v->>'user_agent', ''), 400);
begin
  -- at most 300 rows a minute in total, and 30 per IP per hour
  if (select count(*) from visits where created_at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  if v_ip is not null and
     (select count(*) from visits where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into visits (ip, country, city, region, isp, browser, os, device, visitor_id, path, referrer,
                      language, timezone, user_agent, headers, cf)
  values (
    v_ip,
    left(v->>'country', 2),
    left(v->>'city', 80),
    left(v->>'region', 80),
    left(v->>'isp', 120),
    ua_browser(ua), ua_os(ua), ua_device(ua),
    left(v->>'visitor_id', 40),
    left(v->>'path', 200),
    left(v->>'referrer', 300),
    left(v->>'language', 20),
    left(v->>'timezone', 60),
    ua,
    case when length((v->'headers')::text) <= 8000 then v->'headers' end,
    case when length((v->'cf')::text) <= 4000 then v->'cf' end
  );
end;
$$;

-- only the secret key (service_role) may call it
revoke all on function public.record_visit(jsonb) from public, anon, authenticated;
grant execute on function public.record_visit(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- log_visit: the old page-side log (public key). Kept until the Cloudflare site works.
-- ---------------------------------------------------------------------------
drop function if exists public.log_visit(text, text, text, text);

create or replace function public.log_visit(info jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h    json := coalesce(nullif(current_setting('request.headers', true), '')::json, '{}'::json);
  v_ip text := nullif(trim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', ''), ',', 1)), '');
  ua   text := left(coalesce(h->>'user-agent', ''), 400);
begin
  -- at most 300 rows a minute in total, and 30 per IP per hour
  if (select count(*) from visits where created_at > now() - interval '1 minute') >= 300 then
    return;
  end if;
  if v_ip is not null and
     (select count(*) from visits where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into visits (ip, country, browser, os, device, visitor_id, nav, path, referrer,
                      language, site_lang, timezone, screen, user_agent, headers, client)
  values (
    v_ip,
    h->>'cf-ipcountry',
    ua_browser(ua), ua_os(ua), ua_device(ua),
    left(info->>'visitor_id', 40),
    left(info->>'nav', 20),
    left(info->>'path', 200),
    left(info->>'referrer', 300),
    left(info->>'language', 20),
    left(info->>'site_lang', 5),
    left(info->>'timezone', 60),
    left(info->>'screen', 20),
    ua,
    h::jsonb - 'authorization' - 'apikey' - 'cookie',
    case when length(info::text) <= 8000 then info end
  );
end;
$$;

revoke all on function public.log_visit(jsonb) from public;
grant execute on function public.log_visit(jsonb) to anon;

-- Once the Cloudflare site logs visits, turn the page-side log off by running just this line:
--   revoke execute on function public.log_visit(jsonb) from anon;
