# Review loop: founders comment, Claude makes the changes

Status: built. The one manual step left is creating the Claude cloud task (docs/claude-review-task.md).

## The idea in one paragraph

Each founder runs the site on their own laptop with one command, switches on **review mode**, highlights any text and leaves a comment. Comments are saved to our Neon database, so everyone sees everyone else's. Whenever a round has enough in it, anyone presses **Make the changes**. That sends every comment to a Claude Code session in Anthropic's cloud, which edits the site and pushes the result to our working branch, `feat/automated-sandboxing`. We `git pull`, look at the new version and Claude's answer to each comment, and keep going in the next round. No meeting, and no one person typing everyone's notes into the code.

## One round, step by step

1. `git pull`, then `npm run review`. Open `http://localhost:8000`.
2. Click **Review** (bottom left). The panel opens on the right; the page stays fully usable.
3. Select any text and press **Comment**. Write the comment, pick a type (wording, numbers, design, idea, other), and save. Your name is remembered; leave it blank to stay anonymous. The others see it within about 8 seconds.
4. Reply to anyone's comment; edit or delete your own. **All pages** shows comments on the story and the paper together.
5. **I'm done with this round** tells the others you have finished. It's only a signal: it doesn't block anything.
6. Anyone can press **Make the changes** at any time; one person reviewing alone is fine. The round goes to Claude, and new comments go into the next round.
7. The panel links to the live Claude session. Once Claude has pushed, it says **Claude has pushed: run `git pull`**.
8. After pulling, open **Round N: Claude's notes**: each comment shows ✓ Done or ✗ Not done with a one-line note, under Claude's summary of the round.

Nothing reaches `main` or production on its own. Merging to `main` stays a deliberate pull request by a person.

## Why `npm run review` and not `python -m http.server`

The comments live in Neon, and talking to Neon needs the database password. A plain file server could only hand that password to the browser, where anyone could read it.

`npm run review` serves the site exactly like `python -m http.server`, plus a few review endpoints that use the password from your local `.env`. It listens only on your own computer, adds the review tools to each page as it serves it, and refuses requests from other websites. The site files don't change, and nothing in `review/` is deployed. `python -m http.server` still works for plain viewing.

## What you can comment on

- **Text**: select it and press **Comment**.
- **Images**: hover an image and press **Comment on image**.
- **Anything else**: press **⌖ Point at…** in the panel, then click a chart, card, video, the paper's simulation view or any block. On the story, clicking an empty part of a chapter comments on that chapter's **3D scene**: Claude then adjusts the chapter's camera shot.

Commented text is highlighted in yellow; commented images and blocks get a yellow outline. Click either to jump to its comment.

## What a comment remembers

Pages change between rounds, so a comment can't just remember "line 212". It stores:

- what it is about: the exact highlighted text (plus about 40 characters before and after it), or the image file and its alt text, or the chapter and camera shot of the 3D scene
- where it is on the page: the chapter id, the chapter's heading as readers see it, and a CSS selector for the element
- where it is in the code: the file and line, found by the review server in the source (in the page's script when the text is built by JavaScript), and looked up again when the round is sent
- the comment, its type, the name (or anonymous), the time, and the git commit the reviewer was looking at

The panel shows that location on every comment (for example `index.html:281 · Problem and solution`), and Claude receives all of it, so it can go straight to the spot. If the text or image has since changed, the comment stays in the panel, marked as no longer on the page. Highlights are painted over the page without touching its markup, so the story's animations and the live simulation keep working in review mode.

## Data in Neon

One migration, `db/migrations/20261025120000_review.sql`, adds three tables to the **dev** database branch that `vercel env pull .env --environment=development` already gives every founder:

| Table | Holds |
|---|---|
| `tw_review_rounds` | round number, status (open, sent, applied), who sent it and when, the Claude session link, the branch tip at sending, Claude's summary |
| `tw_review_comments` | comments and replies, as above, plus Claude's result and note |
| `tw_review_finished` | who said "I'm done" in which round |

## Make the changes: how Claude runs in the cloud

This uses **Claude Code on the web** and its **scheduled tasks** (formerly "routines"): a saved Claude Code setup that runs in an Anthropic-managed sandbox, here started on demand through its **API trigger**. Setup is one-time, by Harsh: docs/claude-review-task.md.

When someone presses **Make the changes**:

1. The local server collects the round's comments and replies into one compact JSON message (up to about 60,000 characters; anything beyond moves to the next round) and calls the trigger.
2. Anthropic starts a fresh cloud session. It checks out `feat/automated-sandboxing`, makes the changes, writes `review/results/round-N.json` with one answer per comment, commits and pushes.
3. The trigger only answers "started". The local server notices Claude's push by watching the branch on GitHub every 45 seconds.
4. The first founder to pull has their server copy Claude's answers from `round-N.json` into Neon. Everyone then sees them.

Claude never gets database access: it receives the comments in the trigger message and answers in a file in the repository. The task's standing instructions (in docs/claude-review-task.md) keep figures sourced from the paper, keep the story and the paper consistent, follow the asset-hashing rule, and stay away from login, database and deploy code.

## Safety and limits we accept

- **Branches**: Claude only pushes to `feat/automated-sandboxing`. Protecting `main` with a "require a pull request" ruleset makes that a hard guarantee (setup step 3).
- **Who it runs as**: runs use Harsh's Claude plan, and Claude's commits appear under Harsh's GitHub account.
- **Rate**: up to 30 runs per hour per task. The button locks the round while it is being sent, so two people pressing at once start only one run.
- **Unattended runs**: a run can occasionally pause for an approval. The session link in the panel is where someone answers it.
- **Preview product**: scheduled tasks and the trigger are a research preview, and the API is marked experimental. **Copy as Markdown** in the panel gives every comment in a round as text, so a round can always be pasted into a Claude Code session by hand.

## Where things are

| Path | What |
|---|---|
| `review/server.mjs` | the local server: serves the site, injects the tools, stores comments, sends rounds, reads Claude's answers |
| `review/client/` | the review tools in the page |
| `review/results/` | Claude's answers, one file per round (format in `FORMAT.md`) |
| `db/migrations/20261025120000_review.sql` | the three tables |
| `docs/claude-review-task.md` | setting up the cloud task, and the prompt it runs |
