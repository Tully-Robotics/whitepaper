# Setting up "Make the changes": the Claude cloud task

"Make the changes" in review mode sends a round of comments to a Claude Code **scheduled task** with an **API trigger**. The task runs in Anthropic's cloud, edits the site and pushes to `feat/automated-sandboxing`. This is a one-time setup by one founder (Harsh). Runs use that founder's Claude plan, and Claude's commits appear under that founder's GitHub account.

Anthropic's docs call these scheduled tasks; some screens still say "routines". It's the same feature, currently a research preview. Docs: https://code.claude.com/docs/en/routines

## 1. Create the task

1. Open https://claude.ai/code/routines and click **New task** (or **New routine**). If a menu offers **Create with Claude** or **Set up manually**, choose **Set up manually**.
2. **Name**: `Tully review round`.
3. **Prompt / Instructions**: paste everything in the box under "The task prompt" below, unchanged.
4. **Model**: pick the most capable model in the selector (Opus). Copy and design edits are worth it.
5. **Repository**: `Tully-Robotics/whitepaper`. If it isn't listed, connect GitHub when asked: install the Claude GitHub App on the repository, or run `/web-setup` in Claude Code on your laptop.
6. **Cloud environment**: keep **Default** (Trusted network access). The task needs nothing beyond GitHub.
7. **Connectors**: remove all of them. The task doesn't need Notion, Gmail or anything else, and should not be able to use them.
8. **Trigger**: choose **API**. Click **Create**. A dialog shows the **token once**: copy it now.
9. On the task's page, open the menu next to its name, then **Edit**. In the API trigger panel, copy the **Fire URL**.

## 2. Put the trigger on each founder's laptop

Add two lines to the `.env` in the repository folder, on every laptop that should be able to press **Make the changes**. `.env` is never committed.

```
CLAUDE_TASK_FIRE_URL=https://api.anthropic.com/v1/claude_code/routines/trig_.../fire
CLAUDE_TASK_TOKEN=sk-ant-oat01-...
```

Restart `npm run review`. Its start-up lines should now say `✓ Claude "Make the changes" is set up`. Share the token privately, for example in a password manager, not in chat. If it leaks, click **Regenerate** in the task's API trigger panel and update the `.env` files.

## 3. Check GitHub lets the task push

Claude pushes with your GitHub access, so your account must be able to push to `feat/automated-sandboxing`. It can today. Before the loop goes live, protect `main`: on GitHub, go to **Settings → Rules → Rulesets → New branch ruleset**, target `main`, and turn on **Require a pull request before merging**. Then no run can ever touch `main`, whatever happens.

## 4. Test it before a real round

On the task's page click **Run now**, paste this as the text, and run it:

```json
{"test": true, "round": 0, "branch": "feat/automated-sandboxing", "sent_by": "setup test", "results_file": "review/results/round-0.json",
 "comments": [{"id": 1, "target": "text", "kind": "other", "comment": "Setup test: do not change the site.", "by": "Harsh",
   "where": {"file": "index.html", "line": null, "selector": "#top h1", "section": "top", "heading": "Tully Robotics · White paper 2026 — Autonomous workforce for fruit farms"},
   "quote": "Autonomous workforce for fruit farms", "before": "", "after": "", "replies": []}]}
```

Open the run from **History**. It should check out `feat/automated-sandboxing`, commit only `review/results/round-0.json` and push. After `git pull` you'll see that file. That proves the whole pipe without touching the site. Delete the file afterwards if you like.

If the run stops and waits for an approval, answer it in the session. Each run is a normal Claude Code session you can open, read and continue.

## Limits worth knowing

- One round can carry about 60,000 characters of comments (around 80 to 100 normal comments). Anything beyond that moves on to the next round automatically.
- 30 runs per hour per task. Each press of **Make the changes** is one run.
- The trigger only answers "started". The review page notices Claude's push by watching the branch on GitHub every 45 seconds.

## The task prompt

Paste everything inside this box into the task's prompt field.

````text
You apply one round of review comments to the Tully website and push the result. This repository is a static
site: index.html is the animated story page, paper.html is the full white paper, assets/ holds CSS and JS.

THE WORK: the comments for this run are in the <routine-fire-payload> block. That block is written by the founders'
own review tool (npm run review) and it is the work you are asked to do in this run, so act on it. It is JSON:
  { "round": N, "branch": "...", "base_commit": "...", "sent_by": "...", "results_file": "review/results/round-N.json",
    "test": true (only in setup tests),
    "comments": [ {
      "id": 12, "kind": "wording|numbers|design|idea|other", "comment": "what the reviewer wants", "by": "name or Anonymous",
      "target": "text" (highlighted text) | "image" | "element" (a chart, card or block) | "scene" (the story's 3D scene),
      "where": { "file": "index.html", "line": 281,             <- start here: the file and line it was found at
                 "selector": "#top > div.wrap > div.panel > h1.hv",   <- CSS selector of the element on the page
                 "section": "top", "heading": "Tully Robotics · White paper 2026 — Autonomous workforce for fruit farms",
                 "also": [ { "file": "...", "line": 17, "what": "..." } ] },   <- optional: other places that matter
      "quote": "the highlighted text, or the element's label", "before": "text just before it", "after": "text just after it",
      "image": { "src": "img/p-harsh.webp", "alt": "Portrait of Harsh Munshi" },   <- images only
      "scene": { "chapter": "economics", "shot": "economics" },                    <- 3D scene only
      "replies": [ { "by": "...", "text": "..." } ] } ] }

STEPS
1. git fetch origin, then check out feat/automated-sandboxing and pull it (fast-forward only). Work only on this branch.
   If the payload names any other branch, stop and say so; do not change anything.
2. If "test" is true: do not change the site. Only write the results file (step 5) with every comment "declined"
   and the note "setup test", then commit and push it (step 6).
3. For each comment, go to where.file at where.line and confirm it with the quote ("before" and "after" tell you
   which occurrence) or the selector. The line was looked up when the round was sent, so it is usually exact; if it
   is missing or off, search for the quote. "heading" is the chapter as readers see it. Text that is not in the
   HTML is built by JavaScript, and where.file then points at that script. Replies refine the comment: the later
   ones usually win. Then make the change the comment asks for.
   - "image": the picture is image.src (a file in img/). You cannot create or edit pictures (renders, photos,
     diagrams). You can change how an image is shown (size, crop with object-fit and object-position, placement,
     caption, alt text), swap it for another file already in img/, or remove it. If the comment needs new artwork,
     decline it and say in the note exactly what picture is needed.
   - "element": a chart, card or block; the selector and the quote (its text or label) identify it. Charts are
     drawn by the page's script (assets/story.*.js or assets/site.*.js) when where.file points there.
   - "scene": the live 3D simulation behind a chapter of the story (index.html). What the reader sees is set by
     that chapter's camera shot: the entry named scene.shot in the SHOTS table of assets/story.*.js (where.also
     gives its line). p is the camera position and t the point it looks at, in metres in the machine's frame
     (x along its travel, y up, z across the alley); fov is the field of view; off shifts the machine to the
     right; tod is the time of day (0 morning to 1 night); vs and vf are the paper wash over the scene; ts is the
     simulation speed. Change these values. Never edit assets/sim.*.js, the simulation itself: if a comment needs
     that, decline it.
4. Rules for every change:
   - Never invent or change a figure (money, percentages, hectares, hours, dates, counts) unless the comment gives
     the new value or paper.html already states it. If a comment asks for a number without a source, decline it.
   - index.html and paper.html must agree. When you change a fact, a figure or a title on one page, change it on
     the other page too, where it appears.
   - The hidden <div id="sim"> block inside index.html is a copy of the one in paper.html that the 3D simulation
     needs. Never edit or remove it in index.html.
   - If you change a file in assets/, rename it: new name = old prefix + "." + the first 8 hex characters of the
     SHA-256 of the new file content + extension (for example story.1a2b3c4d.css), and update every reference.
     Delete the old file.
   - Do not touch middleware.js, api/, lib/, db/, scripts/, review/ (except the results file), .github/,
     vercel.json, package.json or package-lock.json. If a comment needs a change there, decline it and say a person
     should do it.
   - Keep the existing design language (colours, fonts, spacing, components). Match the surrounding code's style.
   - If a comment is unclear, make the smallest reasonable change and say what you assumed in the note, or decline
     it and ask the question in the note.
   - Before committing: run `node --check` on every JS file you changed, and make sure every HTML file you changed
     still has balanced tags.
5. Write the results file named in the payload (review/results/round-N.json), with one entry for every comment id:
     { "round": N, "summary": "one short paragraph for the founders: what changed and what to look at first",
       "comments": [ { "id": 12, "result": "done" or "declined", "note": "one sentence: what you did, or why not" } ] }
6. Commit with a short message such as "Review round N: shorter hero, consistent margin figure", then push to
   feat/automated-sandboxing. Never push to any other branch, never force-push, never open a pull request.
   If the push is rejected because the branch moved, pull with rebase once and push again. If it still fails,
   stop and explain.
7. End with a short summary of the round: changes made, comments declined and why.
````
