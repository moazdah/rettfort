// Databaseskjema. Kjøres ved oppstart (idempotent). Regnskapsreglene håndheves også i databasen:
// posteringer kan ikke endres eller slettes, hvert bilag må gå i null, låste perioder kan ikke få nye bilag.

export const SKJEMA_VERSJON = 7;

export const SKJEMA = /* sql */ `
create table if not exists skjema_versjon (versjon int primary key, tid timestamptz not null default now());

create table if not exists organisasjon (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('selskap','byra')),
  navn text not null,
  orgnr text,
  orgform text not null default 'AS',
  stiftet date,
  adresse text, postnr text, poststed text, kommunenr text,
  epost text, telefon text,
  kontonr text,
  mva_registrert boolean not null default true,
  mva_termin text not null default 'tomnd' check (mva_termin in ('tomnd','aar','ingen')),
  regnskap_fra date,
  nace text,
  pakke text not null default 'gratis' check (pakke in ('gratis','start','selskap','byra')),
  faktura_forfall_dager int not null default 14,
  faktura_tekst text,
  faktura_logo text,
  kid_metode text not null default 'mod10' check (kid_metode in ('mod10','mod11')),
  ehf boolean not null default true,
  purring boolean not null default true,
  bilag_slug text unique,
  aga_sone text not null default '1',
  ferie_prosent numeric not null default 10.2,
  lonningsdag int,
  otp text,
  neste_bilagsnr int not null default 1,
  neste_fakturanr int not null default 10001,
  neste_kundenr int not null default 1,
  opprettet timestamptz not null default now()
);

create table if not exists bruker (
  id uuid primary key default gen_random_uuid(),
  epost text not null unique,
  navn text not null,
  passord_hash text not null,
  epost_bekreftet boolean not null default false,
  bekreftkode text,
  opprettet timestamptz not null default now()
);

create table if not exists medlemskap (
  bruker_id uuid not null references bruker(id) on delete cascade,
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  rolle text not null check (rolle in ('eier','full','les','kvittering','regnskapsforer_full','regnskapsforer_les')),
  opprettet timestamptz not null default now(),
  primary key (bruker_id, organisasjon_id)
);

create table if not exists sesjon (
  token_hash text primary key,
  bruker_id uuid not null references bruker(id) on delete cascade,
  organisasjon_id uuid references organisasjon(id) on delete set null,
  utloper timestamptz not null,
  opprettet timestamptz not null default now()
);

create table if not exists kontakt (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  type text not null check (type in ('kunde','leverandor','begge')),
  navn text not null,
  orgnr text,
  adresse text, postnr text, poststed text,
  epost text,
  kundenr int,
  mva_registrert boolean,
  opprettet timestamptz not null default now()
);
create index if not exists kontakt_org on kontakt(organisasjon_id);

create table if not exists bilag (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  nr int not null,
  dato date not null,
  type text not null,
  beskrivelse text,
  kilde text,
  kontakt_id uuid references kontakt(id),
  korrigerer_id uuid references bilag(id),
  opprettet_av uuid references bruker(id),
  opprettet timestamptz not null default now(),
  unique (organisasjon_id, nr)
);
create index if not exists bilag_org_dato on bilag(organisasjon_id, dato);

create table if not exists postering (
  id bigserial primary key,
  bilag_id uuid not null references bilag(id) on delete restrict,
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  linje int not null,
  dato date not null,
  konto int not null check (konto between 1000 and 8999),
  debet bigint not null default 0 check (debet >= 0),
  kredit bigint not null default 0 check (kredit >= 0),
  mva_kode text,
  mva_grunnlag bigint,
  kontakt_id uuid references kontakt(id),
  beskrivelse text,
  check (debet = 0 or kredit = 0),
  check (debet > 0 or kredit > 0)
);
create index if not exists postering_org_dato on postering(organisasjon_id, dato);
create index if not exists postering_bilag on postering(bilag_id);

create table if not exists periode_laas (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  til_dato date not null,
  grunn text not null,
  laast_av uuid references bruker(id),
  tid timestamptz not null default now()
);

create table if not exists vedlegg (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  filnavn text not null,
  mime text not null,
  storrelse int not null,
  lagring text not null, -- 'blob:<url>' eller 'db'
  data bytea,
  opprettet timestamptz not null default now()
);

create table if not exists faktura (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  type text not null check (type in ('faktura','tilbud','kvittering','kreditnota')),
  nr int,
  status text not null default 'utkast' check (status in ('utkast','sendt','betalt','kreditert','delvis_betalt','akseptert')),
  kontakt_id uuid references kontakt(id),
  dato date not null,
  forfall date,
  levert text,
  referanse text,
  kid text,
  netto bigint not null default 0,
  mva bigint not null default 0,
  total bigint not null default 0,
  betalt bigint not null default 0,
  bilag_id uuid references bilag(id),
  krediterer_id uuid references faktura(id),
  kreditgrunn text,
  gjentakelse text,
  avsender jsonb,
  sendt_tid timestamptz,
  apnet_tid timestamptz,
  opprettet timestamptz not null default now(),
  unique (organisasjon_id, type, nr)
);
create index if not exists faktura_org on faktura(organisasjon_id);

create table if not exists faktura_linje (
  id uuid primary key default gen_random_uuid(),
  faktura_id uuid not null references faktura(id) on delete cascade,
  linje int not null,
  beskrivelse text not null,
  antall_milli int not null,
  pris bigint not null,
  mva_sats int not null,
  konto int
);

create table if not exists kjop (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  status text not null default 'utkast' check (status in ('utkast','registrert','betalt','trenger_titt')),
  kontakt_id uuid references kontakt(id),
  leverandor_navn text,
  leverandor_orgnr text,
  dato date,
  forfall date,
  tekst text,
  total bigint not null default 0,
  mva bigint not null default 0,
  sats int,
  konto int,
  linjer jsonb,
  betalt_med text,
  vedlegg_id uuid references vedlegg(id),
  bilag_id uuid references bilag(id),
  videre_kontakt_id uuid references kontakt(id),
  videre_faktura_id uuid references faktura(id),
  kilde text,
  opprettet timestamptz not null default now()
);
create index if not exists kjop_org on kjop(organisasjon_id);

create table if not exists kontoutskrift (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  konto int not null default 1920,
  maned text not null,
  filnavn text,
  ib bigint, ub bigint,
  status text not null default 'apen' check (status in ('apen','ferdig')),
  opprettet timestamptz not null default now(),
  unique (organisasjon_id, konto, maned)
);

create table if not exists bankbevegelse (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  kontoutskrift_id uuid not null references kontoutskrift(id) on delete cascade,
  dato date not null,
  tekst text not null,
  belop bigint not null,
  kid text,
  referanse text,
  status text not null default 'apen' check (status in ('apen','matchet','foreslatt','ignorert')),
  match_type text,
  match_id uuid,
  bilag_id uuid references bilag(id),
  forslag text
);
create index if not exists bankbevegelse_org on bankbevegelse(organisasjon_id);

create table if not exists kontrollfunn (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  kode text not null,
  alvor text not null default 'middels',
  tekst text not null,
  ref_type text, ref_id uuid,
  status text not null default 'apen' check (status in ('apen','lost','ignorert')),
  opprettet timestamptz not null default now()
);

create table if not exists ansatt (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  navn text not null,
  epost text,
  stilling text,
  lonn_type text not null default 'fast' check (lonn_type in ('fast','time')),
  manedslonn bigint not null default 0,
  timesats bigint not null default 0,
  skatteprosent numeric not null default 30,
  kontonr text,
  startdato date,
  aktiv boolean not null default true,
  opprettet timestamptz not null default now()
);

create table if not exists lonnskjoring (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  periode text not null,
  utbetalingsdato date not null,
  status text not null default 'kjort',
  bilag_id uuid references bilag(id),
  brutto bigint not null, skatt bigint not null, netto bigint not null, aga bigint not null, feriepenger bigint not null,
  opprettet timestamptz not null default now(),
  unique (organisasjon_id, periode)
);

create table if not exists lonnslipp (
  id uuid primary key default gen_random_uuid(),
  lonnskjoring_id uuid not null references lonnskjoring(id) on delete cascade,
  ansatt_id uuid not null references ansatt(id),
  brutto bigint not null, skatt bigint not null, netto bigint not null, feriepenger bigint not null,
  linjer jsonb not null
);

create table if not exists byra_kunde (
  byra_id uuid not null references organisasjon(id) on delete cascade,
  selskap_id uuid not null references organisasjon(id) on delete cascade,
  status text not null default 'invitert' check (status in ('invitert','aktiv','avsluttet')),
  rolle text not null default 'regnskapsforer_full',
  opprettet timestamptz not null default now(),
  primary key (byra_id, selskap_id)
);

create table if not exists invitasjon (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  epost text not null,
  rolle text not null,
  token text not null unique,
  status text not null default 'venter' check (status in ('venter','godtatt','trukket')),
  opprettet timestamptz not null default now()
);

create table if not exists mva_melding (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  fra date not null, til date not null,
  status text not null default 'sendt' check (status in ('sendt','betalt')),
  a_betale bigint not null,
  linjer jsonb not null,
  bilag_id uuid references bilag(id),
  sendt_av uuid references bruker(id),
  sendt_tid timestamptz not null default now(),
  kanal text not null default 'manuell',
  unique (organisasjon_id, fra, til)
);

create table if not exists logg (
  id bigserial primary key,
  organisasjon_id uuid references organisasjon(id) on delete cascade,
  bruker_id uuid references bruker(id) on delete set null,
  handling text not null,
  ref text,
  tid timestamptz not null default now()
);

-- Posteringer og bilag kan aldri endres eller slettes.
create or replace function rf_uforanderlig() returns trigger language plpgsql as $$
begin
  raise exception 'Posteringer kan ikke endres eller slettes. Bruk korrigering.';
end $$;
drop trigger if exists postering_uforanderlig on postering;
create trigger postering_uforanderlig before update or delete on postering for each row execute function rf_uforanderlig();
drop trigger if exists bilag_uforanderlig on bilag;
create trigger bilag_uforanderlig before update or delete on bilag for each row execute function rf_uforanderlig();

-- Hvert bilag må gå i null ved commit.
create or replace function rf_balanse() returns trigger language plpgsql as $$
declare diff bigint;
begin
  select coalesce(sum(debet),0) - coalesce(sum(kredit),0) into diff from postering where bilag_id = new.bilag_id;
  if diff <> 0 then
    raise exception 'Bilaget går ikke i null (differanse % øre).', diff;
  end if;
  return null;
end $$;
drop trigger if exists postering_balanse on postering;
create constraint trigger postering_balanse after insert on postering deferrable initially deferred for each row execute function rf_balanse();

-- Låste perioder.
create or replace function rf_periodelaas() returns trigger language plpgsql as $$
declare laast date;
begin
  select max(til_dato) into laast from periode_laas where organisasjon_id = new.organisasjon_id;
  if laast is not null and new.dato <= laast then
    raise exception 'Perioden til og med % er låst. Før rettelsen i en åpen periode.', to_char(laast, 'DD.MM.YYYY');
  end if;
  return new;
end $$;
drop trigger if exists bilag_periodelaas on bilag;
create trigger bilag_periodelaas before insert on bilag for each row execute function rf_periodelaas();
drop trigger if exists postering_periodelaas on postering;
create trigger postering_periodelaas before insert on postering for each row execute function rf_periodelaas();

-- Versjon 2: hemmelig lenke til kalenderabonnement på frister.
alter table organisasjon add column if not exists kalender_token text unique;

-- Totrinns innlogging med autentiseringsapp.
alter table bruker add column if not exists totp_hemmelig text;
alter table bruker add column if not exists totp_ny text;
alter table bruker add column if not exists totp_feil int not null default 0;
alter table bruker add column if not exists totp_sperret_til timestamptz;

-- Versjon 5: flere lønnsformer (provisjon), overtid, stillingsprosent og faste tillegg per ansatt.
alter table ansatt drop constraint if exists ansatt_lonn_type_check;
alter table ansatt add constraint ansatt_lonn_type_check check (lonn_type in ('fast','time','provisjon'));
alter table ansatt add column if not exists provisjon_prosent numeric not null default 0;
alter table ansatt add column if not exists overtid_prosent numeric not null default 40;
alter table ansatt add column if not exists stillingsprosent numeric not null default 100;
alter table ansatt add column if not exists faste_tillegg jsonb not null default '[]';
-- Kunden slik den var da dokumentet ble sendt. Senere endringer på kunden påvirker ikke sendte fakturaer.
alter table faktura add column if not exists mottaker jsonb;

-- Versjon 6: lønnslipp på e-post, beskyttet med fødselsnummer eller eget passord, sendt når arbeidsgiveren velger.
alter table ansatt add column if not exists slipp_passord_hash text;
alter table ansatt add column if not exists slipp_passord_type text;
alter table lonnslipp add column if not exists token text unique;
alter table lonnslipp add column if not exists send_etter timestamptz;
alter table lonnslipp add column if not exists sendt_tid timestamptz;
alter table lonnslipp add column if not exists apnet_tid timestamptz;
alter table lonnslipp add column if not exists feil int not null default 0;
alter table lonnslipp add column if not exists sperret_til timestamptz;

-- Versjon 7: skanning med mobil. Lenker som bare kan sende inn dokumenter (egen QR, klient, ansatt),
-- en innboks for det som kommer inn, og utlegg som betales tilbake med lønnen eller med en gang.
create table if not exists skannelenke (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  token text not null unique,
  type text not null check (type in ('egen','klient','ansatt')),
  ansatt_id uuid references ansatt(id),
  navn text,
  epost text,
  utloper timestamptz,
  slettet boolean not null default false,
  opprettet_av uuid references bruker(id),
  opprettet timestamptz not null default now()
);
create table if not exists innsending (
  id uuid primary key default gen_random_uuid(),
  organisasjon_id uuid not null references organisasjon(id) on delete cascade,
  lenke_id uuid references skannelenke(id),
  vedlegg_id uuid references vedlegg(id),
  type text not null,
  fra_navn text,
  tekst text,
  betalt_med text,
  status text not null default 'ny' check (status in ('ny','hentet','registrert','godkjent','avvist','betalt')),
  kjop_id uuid references kjop(id),
  belop bigint,
  tilbake text,
  lonnskjoring_id uuid references lonnskjoring(id),
  avvist_grunn text,
  opprettet timestamptz not null default now(),
  behandlet timestamptz
);
create index if not exists innsending_org on innsending (organisasjon_id, status);
alter table organisasjon add column if not exists utlegg_tilbake text;
alter table lonnslipp add column if not exists utlegg bigint not null default 0;
alter table lonnslipp add column if not exists utlegg_linjer jsonb not null default '[]';

-- Supabase gir tilgang til tabellene i «public» gjennom sitt eget API med en offentlig nøkkel.
-- Systemet bruker ikke det API-et, så all slik tilgang stenges: radsikkerhet uten regler, og ingen rettigheter
-- for rollene anon og authenticated. Systemet selv kobler til som eier av tabellene og påvirkes ikke.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;
`;
