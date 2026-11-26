-- Visit log for Pet the Cat.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste all -> Run.
-- Safe to run again: it only adds what is missing.
--
-- Every page open calls log_visit(). The IP, country and browser are read from the
-- request on the server, so a visitor can't fake them. Visitors can only add rows
-- through the function; they can't read, edit or delete the table.
-- See the rows in Table Editor -> visits.

create table if not exists public.visits (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now()
);
alter table public.visits
  add column if not exists ip          text,   -- visitor's IP address
  add column if not exists country     text,   -- 2-letter code, e.g. VN
  add column if not exists browser     text,   -- Chrome, Safari, Cốc Cốc, Zalo app...
  add column if not exists os          text,   -- Windows, macOS, iOS, Android...
  add column if not exists device      text,   -- Desktop, Mobile, Tablet, Bot
  add column if not exists visitor_id  text,   -- random id kept in the browser: same id = same person coming back
  add column if not exists nav         text,   -- navigate = new open, reload = refresh, back_forward
  add column if not exists path        text,   -- page and query string
  add column if not exists referrer    text,   -- where they came from (Google, Facebook...)
  add column if not exists language    text,   -- browser language, e.g. vi-VN
  add column if not exists site_lang   text,   -- language of the page: en / vi
  add column if not exists timezone    text,   -- e.g. Asia/Ho_Chi_Minh
  add column if not exists screen      text,   -- e.g. 1920x1080
  add column if not exists user_agent  text;   -- full browser string
create index if not exists visits_ip_time on public.visits (ip, created_at desc);
create index if not exists visits_time on public.visits (created_at desc);

-- RLS on and no policies: the public key can't touch the table directly.
alter table public.visits enable row level security;
revoke all on table public.visits from anon, authenticated;

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
  -- at most 30 rows per IP per hour, so nobody can flood the table
  if v_ip is not null and
     (select count(*) from visits where ip = v_ip and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into visits (ip, country, browser, os, device, visitor_id, nav, path, referrer,
                      language, site_lang, timezone, screen, user_agent)
  values (
    v_ip,
    h->>'cf-ipcountry',
    case
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
      else 'Other' end,
    case
      when ua ~* 'iphone|ipad|ipod'            then 'iOS'
      when ua ~* 'android'                     then 'Android'
      when ua ~* 'windows'                     then 'Windows'
      when ua ~* 'mac os x|macintosh'          then 'macOS'
      when ua ~* 'cros'                        then 'ChromeOS'
      when ua ~* 'linux'                       then 'Linux'
      else 'Other' end,
    case
      when ua ~* 'bot|crawler|spider'          then 'Bot'
      when ua ~* 'ipad|tablet' or (ua ~* 'android' and ua !~* 'mobile') then 'Tablet'
      when ua ~* 'mobi|iphone|ipod|android'    then 'Mobile'
      else 'Desktop' end,
    left(info->>'visitor_id', 40),
    left(info->>'nav', 20),
    left(info->>'path', 200),
    left(info->>'referrer', 300),
    left(info->>'language', 20),
    left(info->>'site_lang', 5),
    left(info->>'timezone', 60),
    left(info->>'screen', 20),
    ua
  );
end;
$$;

revoke all on function public.log_visit(jsonb) from public;
grant execute on function public.log_visit(jsonb) to anon;
