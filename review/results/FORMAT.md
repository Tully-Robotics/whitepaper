# Claude's answers to review rounds

The cloud task (docs/claude-review-task.md) writes one file here per round it applies: `round-<N>.json`.
When a founder pulls and opens review mode, `npm run review` copies these answers into the database, and every
comment then shows Claude's note in the panel under "Round N: Claude's notes".

```json
{
  "round": 3,
  "summary": "One paragraph: what changed in this round, and anything a founder should look at first.",
  "comments": [
    { "id": 41, "result": "done", "note": "Shortened the headline; the story and the paper now match." },
    { "id": 42, "result": "declined", "note": "The paper has no source for 25 %, so the figure stays at 10 %." }
  ]
}
```

- `id` is the comment id from the round's payload; every comment in the payload gets exactly one entry.
- `result` is `done` or `declined`. Declined always comes with a note that says why.
- Keep these files: they are the record of what was asked and what was done.
