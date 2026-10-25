-- migrate:up
-- Review mode (npm run review, see docs/review-loop.md): people comment on the site locally, and a round of
-- comments is sent to a Claude Code cloud session that applies them and answers each one.

-- One row per round. The open round collects comments; sending it to Claude closes it and opens the next.
create table if not exists tw_review_rounds (
  id            serial primary key,              -- the round number people see
  status        text not null default 'open' check (status in ('open', 'sent', 'applied')),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_by       text,
  base_commit   text,                             -- the commit the sender was on when the round went to Claude
  branch_head   text,                             -- the branch tip on GitHub when the round was sent: a newer tip means Claude pushed
  session_url   text,                             -- the Claude Code session that applies the round
  applied_at    timestamptz,
  result_commit text,                             -- the commit that brought Claude's results file in
  summary       text                              -- Claude's one-paragraph summary of the round
);
-- at most one open round at a time
create unique index if not exists tw_review_rounds_one_open on tw_review_rounds ((true)) where status = 'open';

-- Comments and replies. A comment remembers the highlighted text (with a little context on both sides),
-- because pages change between rounds and line numbers would not survive.
create table if not exists tw_review_comments (
  id          bigserial primary key,
  round_id    int not null references tw_review_rounds (id) on delete cascade,
  parent_id   bigint references tw_review_comments (id) on delete cascade,  -- set for replies
  page        text,                               -- '/index.html' or '/paper.html'
  target      text not null default 'text' check (target in ('text', 'image', 'element', 'scene')),
  section     text,                               -- id of the chapter or section it is in
  heading     text,                               -- that chapter's eyebrow and title, as readers see them
  selector    text,                               -- CSS selector of the element (for text: the element holding it)
  quote       text,                               -- the highlighted text (whitespace collapsed), or the element's label
  prefix      text,
  suffix      text,
  src         text,                               -- images: the file shown, e.g. img/p-harsh.webp
  alt         text,                               -- images: alt text or aria-label
  shot        text,                               -- the story's 3D scene: the chapter's camera shot (data-shot)
  source_file text,                               -- where it is in the code, found when the comment was saved
  source_line int,
  kind        text check (kind in ('wording', 'numbers', 'design', 'idea', 'other')),
  body        text not null,
  author      text,                               -- null: anonymous
  author_key  text not null,                      -- random id kept in the commenter's browser; only it can edit
  commit_sha  text,                               -- the commit the commenter was looking at
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  deleted_at  timestamptz,
  result      text check (result in ('done', 'declined')),
  note        text                                -- Claude's answer to the comment
);
create index if not exists tw_review_comments_round on tw_review_comments (round_id);

-- Who has said "I'm done" in a round. Informational: anyone can send a round to Claude at any time.
create table if not exists tw_review_finished (
  round_id int not null references tw_review_rounds (id) on delete cascade,
  name     text not null,
  at       timestamptz not null default now(),
  primary key (round_id, name)
);

-- migrate:down
drop table if exists tw_review_finished;
drop table if exists tw_review_comments;
drop table if exists tw_review_rounds;
