-- =============================================================================
--  api/_schema.sql - what the tutor writes down
-- =============================================================================
--  Applied by `npm run db:init`, which is idempotent. Neon Postgres.
--
--  No IP address, no user agent string, no name. A visitor is a random id the
--  browser minted for itself and can clear by clearing site data. `cohort` is
--  the access link's label, so it says which class asked and never who.
--
--  One row per message. The question's row carries the moment it was asked in
--  (`step`, `state`); the answer's row carries how it was produced (`point`,
--  `chapters`, `usage`), and points back at its question with `reply_to`. The
--  `turns` view joins on that, because the aiming question is always "given
--  THAT screen, why THAT target".
--
--  The join is on `reply_to` and NOT on (thread_id, turn): a client sending the
--  single-question form has no transcript to count, so two questions in one
--  thread can carry the same turn number and the join multiplies them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS threads (
  id          uuid PRIMARY KEY,
  visitor_id  uuid NOT NULL,               -- stable per browser, cleared with site data
  lesson      text,                        -- null: the plain ask box, no lesson around it
  cohort      text,                        -- the access link's label; null: ungated (local, or no TUTOR_KEYS)
  started_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          bigserial PRIMARY KEY,
  thread_id   uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  turn        int  NOT NULL,               -- 1-based, counted server-side; display only
  reply_to    bigint REFERENCES messages(id) ON DELETE CASCADE,   -- set on the answer's row
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  text        text NOT NULL,               -- the question, the answer, or the error shown

  -- The question's half: where they were standing when they asked.
  step        int,
  state       jsonb,

  -- The answer's half: what came back and what it cost.
  point       jsonb,                       -- the resolved target, or null for 'none'
  chapters    jsonb,
  provider    text,
  model       text,
  usage       jsonb,
  ms          int,
  error       text,                        -- set instead of a real answer; `text` holds what the student saw

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_idx  ON messages (thread_id, turn, role);
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS threads_visitor_idx  ON threads (visitor_id, started_at DESC);

-- Applied to a table that predates the column. Harmless on a fresh one.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to bigint REFERENCES messages(id) ON DELETE CASCADE;

-- Which access link the thread arrived on. A cohort, never a person: the label
-- is what a rate limit counts against, so it has to be recorded before one can
-- exist. Null on every row written before the gate, and on any ungated request.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS cohort text;

-- After the ALTERs, not with the other indexes: on an existing table these
-- columns do not exist until the lines above run.
CREATE INDEX IF NOT EXISTS messages_reply_idx ON messages (reply_to);

-- The rate limit's query is "how many turns has this cohort taken since T",
-- which is this index and nothing cleverer.
CREATE INDEX IF NOT EXISTS threads_cohort_idx ON threads (cohort, started_at DESC);

-- Backfill: rows written before `reply_to` existed can only be paired the old
-- way. Ambiguous cases are left null rather than guessed, so they drop out of
-- the view instead of pairing a question with someone else's answer.
UPDATE messages a SET reply_to = q.id
FROM   messages q
WHERE  a.reply_to IS NULL AND a.role = 'assistant' AND q.role = 'user'
  AND  q.thread_id = a.thread_id AND q.turn = a.turn
  AND  1 = (SELECT count(*) FROM messages x
            WHERE x.thread_id = a.thread_id AND x.turn = a.turn AND x.role = 'user');

-- The debugging view. One row per exchange, the screen beside the aim.
DROP VIEW IF EXISTS turns;
CREATE VIEW turns AS
SELECT t.id AS thread_id, t.lesson, t.cohort, t.visitor_id, q.turn,
       q.created_at,
       q.text  AS question,
       a.text  AS answer,
       q.step, q.state,
       a.point ->> 'id'   AS point_id,
       a.point ->> 'kind' AS point_kind,
       (a.point ->> 'home')::boolean AS point_home,
       a.chapters, a.provider, a.model, a.usage, a.ms, a.error
FROM   threads t
JOIN   messages q ON q.thread_id = t.id AND q.role = 'user'
LEFT   JOIN messages a ON a.reply_to = q.id
ORDER  BY q.created_at DESC;

-- =============================================================================
--  finds - one row per search on the question composer
-- =============================================================================
--  Two jobs, which is why it is one table. The RATE LIMIT counts these rows in
--  a window; the EDITORIAL QUEUE reads their text, because a question the map
--  could not answer is the only record of a door worth writing.
--
--  THE OUTCOME USED TO BE ABSENT ON PURPOSE. api/find.js returns a vector and
--  the PAGE ranks it, so the server never learned what a question resolved to;
--  the queue re-scored the texts offline instead, and one round trip per search
--  stayed one round trip.
--
--  That held while a find WAS the search. The bar now walks six tiers and only
--  the last two reach api/find.js at all — a reader who typed a card's NAME, or
--  restored a graft, or was offered a new question, embedded nothing, so those
--  arrivals were invisible here and they are most of them. Re-scoring cannot
--  recover a tier it was never part of. api/land.js beacons the landing after
--  the fact: no round trip in front of the reader, and it folds into the search's
--  own row where there is one, so a question is still one row.
--
--  Same privacy rule as the tutor: no IP, no user agent, no name. `visitor_id`
--  is a uuid the browser minted for itself and shares with the tutor, so
--  clearing site data clears both.
--  `kind` names WHICH endpoint wrote the row. Without it a search and a
--  generation are indistinguishable here, and one question that was searched
--  and then built reads as the same question asked twice.
CREATE TABLE IF NOT EXISTS finds (
  id          bigserial PRIMARY KEY,
  visitor_id  uuid,                        -- null: a browser that would not mint one
  cohort      text,                        -- the access link's label, or null when open
  q           text NOT NULL,               -- what was typed, capped at 400 chars upstream
  kind        text,                        -- 'find' | 'extend'; null on rows written before this column
  ms          int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
-- database made before `kind` needs this to get the column. Idempotent, and it
-- leaves the old rows null rather than guessing what they were.
ALTER TABLE finds ADD COLUMN IF NOT EXISTS kind text;

--  `answer` is what came back, and it exists ONLY on an `extend` row. The
--  reasoning above still holds for a search: the page does that ranking and
--  the server would have to be told. A generation is the other case — the
--  server WROTE the answer, so recording it costs nothing and is the only
--  record there is of what a reader was shown. It is also the expensive call:
--  without this you can see that somebody asked about hollow bones and never
--  what the map told them.
ALTER TABLE finds ADD COLUMN IF NOT EXISTS answer jsonb;

--  `kind` is 'find' | 'extend' | 'land'. A `land` row is an arrival that spent
--  no API call, so _finds.js excludes it from the rate limit — the cap rations
--  spend, and a landing is not spend.
--
--  `is_local` is whether the request came from the machine serving it, by
--  api/_local.js's definition. NOT an address, and not a contradiction of the
--  privacy rule above: a boolean says which side of the loopback a row came
--  from and nothing about who wrote it. Deployed, no real request is loopback,
--  so this is false for every reader and true for whoever is developing —
--  which is the whole point, because a session spent testing the bar otherwise
--  fills the editorial queue with questions no student ever asked. Null on
--  rows written before the column, meaning unknown rather than remote.
ALTER TABLE finds ADD COLUMN IF NOT EXISTS is_local boolean;

-- The limiter's only query is "how many since T", globally and per visitor.
CREATE INDEX IF NOT EXISTS finds_created_idx ON finds (created_at DESC);
CREATE INDEX IF NOT EXISTS finds_visitor_idx ON finds (visitor_id, created_at DESC);

-- =============================================================================
--  apps - what the builder made, every version of it
-- =============================================================================
--  An app is one HTML page a student or teacher built from the component
--  library, plus the lineage that says where it came from. The page itself is
--  stored as the string the browser is handed: no parsed form, nothing to
--  rebuild, and an export is a SELECT.
--
--  OWNERSHIP IS A TOKEN, NOT AN ACCOUNT. `token_hash` is the sha256 of a secret
--  that rides in the edit link once and then lives in the holder's browser.
--  Whoever presents it may save; nobody else can. `owner_id` is null on every
--  row today and exists so that accounts, when they come, are a column to fill
--  and not a migration.
--
--  EVERY TURN IS A ROW, NEVER AN OVERWRITE. A model edit that breaks the page is
--  the common case, and undo is what makes anyone trust the editor. The latest
--  version is the highest `n`; a restore writes a new row copying an old one.
--  `kind` says what wrote it: 'build' and 'edit' spent a model call and are
--  what the rate limit counts; 'text', 'save', 'restore', 'remix' and 'seed'
--  did not. A 'text' row is the WYSIWYG mode's save: find/replace pairs the
--  student made by hand, applied to the stored page by api/app.js.
--
--  Same privacy rule as everything else here: no IP, no name. `cohort` is the
--  access link's label, which for a beta tester is one person, by design.
CREATE TABLE IF NOT EXISTS apps (
  id          text PRIMARY KEY,             -- short, random, unguessable
  cohort      text,
  visitor_id  uuid,
  parent_id   text REFERENCES apps(id) ON DELETE SET NULL,   -- the app this was remixed from
  owner_id    text,                         -- null until accounts exist
  token_hash  text NOT NULL,
  title       text,
  is_local    boolean,                      -- api/_local.js's answer at creation
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- What the shelf draws a card from. `thumb` is a small JPEG data URL of the
-- scene, captured from the running app, and `thumb_meta.scene` is what says so:
-- thumbs taken before the shelf drew its own panel are whole pages with a
-- rasterised panel in them, and the shelf skips those rather than drawing a
-- second panel over the first. `thumb_meta` is the words on the card — brand, eyebrow, title, body, step count, and whether
-- the shell wears a Back/Next row. The shelf composes the two in its own DOM,
-- so the panel is never rasterised and stays sharp at any size. Both are
-- capped at the API, replaced on every edit, and served only to the browser
-- that holds the ids.
ALTER TABLE apps ADD COLUMN IF NOT EXISTS thumb text;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS thumb_meta jsonb;

CREATE TABLE IF NOT EXISTS app_versions (
  id          bigserial PRIMARY KEY,
  app_id      text NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  n           int  NOT NULL,                -- 1-based per app
  kind        text NOT NULL CHECK (kind IN ('build', 'edit', 'text', 'save', 'restore', 'remix', 'seed')),
  html        text NOT NULL,
  request     text,                         -- what was asked, for build and edit
  summary     text,                         -- the model's one line about what changed
  errors      jsonb,                        -- runtime errors the page relayed into this turn
  provider    text,
  model       text,
  usage       jsonb,
  ms          int,
  error       text,                         -- a turn that produced no page still gets a row
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, n)
);

-- The text mode was added after the first apps were stored, so the check has
-- to be replaced rather than declared. Idempotent, and the constraint is named
-- so re-running this does not stack a second copy of it.
ALTER TABLE app_versions DROP CONSTRAINT IF EXISTS app_versions_kind_check;
ALTER TABLE app_versions ADD  CONSTRAINT app_versions_kind_check
  CHECK (kind IN ('build', 'edit', 'text', 'save', 'restore', 'remix', 'seed'));

-- The limiter's query is "how many model turns has this cohort or visitor
-- spent since T", which is this index over the two kinds that spend.
CREATE INDEX IF NOT EXISTS app_versions_created_idx ON app_versions (created_at DESC);
CREATE INDEX IF NOT EXISTS apps_cohort_idx ON apps (cohort, created_at DESC);
CREATE INDEX IF NOT EXISTS apps_visitor_idx ON apps (visitor_id, created_at DESC);

-- =============================================================================
--  teachers, classes, seats - a class that builds without accounts
-- =============================================================================
--  A TEACHER is one row, admitted today by a long code minted from the
--  terminal (`db.js teacher`) and stored hashed. `email` is null until sign-in
--  exists; attaching one to this row is the upgrade, and nothing else moves.
--
--  A SEAT is one student's place in a class, and its code is the student's
--  whole identity: typed once on /build, it owns the apps made under it, so
--  the work follows the code onto any machine. `label` is whatever the teacher
--  types, which may be a name. That is the one place a name can enter the
--  database, it is the teacher's choice, and the dashboard says so.
--
--  THE SEAT CODE IS STORED PLAIN, the teacher's hashed. A teacher reprints a
--  roster, so the code has to be readable back; what it guards is one
--  student's apps and a share of the class's spend, and a dump that exposed the
--  code would expose those apps anyway. The teacher code reaches every student
--  in every class, so it is minted once and never readable.
CREATE TABLE IF NOT EXISTS teachers (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  email       text UNIQUE,                  -- null until sign-in exists
  code_hash   text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id          text PRIMARY KEY,
  teacher_id  text NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seats (
  id          text PRIMARY KEY,
  class_id    text NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  label       text NOT NULL,
  code        text NOT NULL UNIQUE,         -- 'abcd-efgh', lowercase, no 0/o/1/i/l
  revoked_at  timestamptz,                  -- set: the code admits nobody, the work stays
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacher_id, created_at);
CREATE INDEX IF NOT EXISTS seats_class_idx ON seats (class_id, created_at);

-- `apps.owner_id` is 'seat:<id>' or 'teacher:<id>', and `apps.cohort` is
-- 'class:<id>' for a seat's app, so the rate limit counts a class.
CREATE INDEX IF NOT EXISTS apps_owner_idx ON apps (owner_id, created_at DESC);

-- =============================================================================
--  users, sessions, invites - Google sign-in, admitted by invite
-- =============================================================================
--  A USER IS A PERSON, so this is the one table that holds an email and a name
--  by design: Google's, as of their last sign-in. Signing in admits nobody to
--  the builder. `admitted_at` is set by redeeming an invite, and `invite_label`
--  is the invite's cohort, which is what the invite-wide cap counts.
--
--  AN INVITE is 'member' (reusable, `max_uses` null or a number) or 'teacher'
--  (single use). Revoking one stops new redemptions; accounts already admitted
--  keep access, and `users.disabled_at` is how one person is turned off.
--
--  A SESSION is a random token in an HttpOnly cookie, stored hashed.
--
--  An account owns its apps as 'user:<id>'. A teacher is a `teachers` row with
--  `user_id` set; the pilot's code-only teacher links by redeeming that code
--  once while signed in, which moves its apps from 'teacher:<id>' to the user.
CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  google_sub    text NOT NULL UNIQUE,
  email         text,
  name          text,
  admitted_at   timestamptz,
  invite_label  text,
  disabled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS invites (
  code        text PRIMARY KEY,            -- 'abcd-efgh', lowercase
  kind        text NOT NULL CHECK (kind IN ('member', 'teacher')),
  label       text NOT NULL,               -- the cohort a member invite admits into
  max_uses    int,                         -- null: unlimited. 1 for every teacher invite
  uses        int NOT NULL DEFAULT 0,
  note        text,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS user_id text UNIQUE REFERENCES users(id) ON DELETE SET NULL;
