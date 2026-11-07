
-- Roles
create type public.app_role as enum ('reviewer', 'policy_owner', 'ops_lead');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by signed-in" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "roles readable by signed-in" on public.user_roles for select to authenticated using (true);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Base tables (mirror docs/schema.sql)
create table public.policy_versions (
  id text primary key,
  config jsonb not null,
  description text,
  status text not null default 'draft' check (status in ('draft','approved','active','retired')),
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.claims (
  case_id text primary key,
  case_status text,
  claim_summary text,
  policy_active_on_incident boolean,
  claim_type text,
  repair_type text,
  quote_eur numeric,
  incident_report_present boolean,
  itemized_quote_present boolean,
  injury_reported boolean,
  liability_disputed boolean,
  duplicate_flag boolean,
  evidence_conflict boolean,
  raw jsonb,
  received_at timestamptz default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id) on delete cascade,
  policy_version text not null,
  recommendation text not null check (recommendation in ('routine_processing','request_information','human_review')),
  rule_id text not null,
  explanation text,
  missing_fields text[] not null default '{}',
  needs_recheck boolean not null default false,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.decisions (case_id) where is_current;

create table public.overrides (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references public.decisions(id),
  case_id text not null references public.claims(case_id),
  policy_version text,
  original_recommendation text,
  new_recommendation text not null,
  reason_code text,
  reason_text text,
  reviewer text,
  second_approver text,
  handling_seconds int,
  created_at timestamptz not null default now()
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id),
  decision_id uuid references public.decisions(id),
  final_outcome text,
  correct_next_step text,
  recorded_by text,
  recorded_at timestamptz not null default now()
);

-- UI tables
create table public.case_workflow (
  case_id text primary key references public.claims(case_id) on delete cascade,
  queue text not null check (queue in ('on_you','waiting_customer','auto_processed','done')),
  assignee text,
  qa_sample boolean not null default false,
  sla_due_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id) on delete cascade,
  type text not null,
  actor text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.case_events (case_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id),
  author text,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.outreach (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id) on delete cascade,
  channel text not null check (channel in ('email','phone')),
  missing_items text[] not null default '{}',
  status text not null default 'sent' check (status in ('sent','reminded','answered','expired')),
  sent_at timestamptz not null default now(),
  last_reminder_at timestamptz,
  reminder_count int not null default 0
);

create table public.claim_intake (
  case_id text primary key references public.claims(case_id) on delete cascade,
  channel text not null check (channel in ('phone','online_form','csv_import')),
  customer_name text,
  plate text,
  received_at timestamptz default now(),
  transcript jsonb,
  form jsonb,
  documents jsonb,
  audio_url text
);

create table public.fact_sources (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.claims(case_id) on delete cascade,
  field text not null,
  source_type text not null check (source_type in ('transcript','form','document','system','csv')),
  ref text,
  quote text,
  confidence text not null default 'confirmed' check (confidence in ('confirmed','unconfirmed')),
  created_at timestamptz not null default now()
);
create index on public.fact_sources (case_id);

-- Grants
grant select, insert, update on public.policy_versions, public.claims, public.decisions, public.case_workflow, public.outreach, public.claim_intake to authenticated;
grant select, insert on public.overrides, public.outcomes, public.case_events, public.comments, public.fact_sources to authenticated;
grant all on public.policy_versions, public.claims, public.decisions, public.overrides, public.outcomes, public.case_workflow, public.case_events, public.comments, public.outreach, public.claim_intake, public.fact_sources to service_role;

-- RLS
alter table public.policy_versions enable row level security;
alter table public.claims enable row level security;
alter table public.decisions enable row level security;
alter table public.overrides enable row level security;
alter table public.outcomes enable row level security;
alter table public.case_workflow enable row level security;
alter table public.case_events enable row level security;
alter table public.comments enable row level security;
alter table public.outreach enable row level security;
alter table public.claim_intake enable row level security;
alter table public.fact_sources enable row level security;

do $$
declare t text;
begin
  foreach t in array array['policy_versions','claims','decisions','case_workflow','outreach','claim_intake'] loop
    execute format('create policy "staff read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "staff insert %1$s" on public.%1$I for insert to authenticated with check (true)', t);
    execute format('create policy "staff update %1$s" on public.%1$I for update to authenticated using (true)', t);
  end loop;
  foreach t in array array['overrides','outcomes','case_events','comments','fact_sources'] loop
    execute format('create policy "staff read %1$s" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "staff append %1$s" on public.%1$I for insert to authenticated with check (true)', t);
  end loop;
end $$;
