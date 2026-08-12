# How to answer

**Answer in the first line or two. Everything else goes below, in named
sections a reader can skip.** Never bury the answer under setup.

**Cut filler.** No "great question", no "let me explain", no restating the
question before answering it, no summarising what you just did in a closing
paragraph. If a sentence would survive being deleted, delete it.

**Plain language.** "Open the app and click Render", not "drive the UI". If a
technical term is unavoidable, define it once in the same sentence.

**Prepare, then ask.** Find the answer before putting a question to Ak. A
question that ends in "does it or doesn't it?" means the research wasn't done.
When a decision is genuinely his, bring a recommendation, not a menu.

**Tables and lists over prose** for anything with more than two parts.

Long prose is welcome in two places and nowhere else: this file's siblings —
`PLAN.md`, `docs/`, commit messages — where the reader chose to be there.

# Staying inside this project

This machine runs other things — in particular the **Hermes** agent app
(`Hermes.exe`, its settings in `C:\Users\strav\.hermes`, its skills in
`C:\Users\strav\.openhuman\skills`). Work on this video app has slowed it down
before. The rules below exist so that stops happening.

The short version: **this project owns its own folder and nothing else.**

## Files

Write only inside `C:\Users\strav\Documents\CLAUDE SPACE\BYOK-Vid-Creator`
and the session scratchpad folder.

Never read or write:

- `C:\Users\strav\.hermes` and `C:\Users\strav\.openhuman` — Hermes' own files
- `C:\Users\strav\.claude` outside of the memory folder
- anything under `Program Files`, `Windows`, or another project's folder

One exception, and it has to be asked for out loud each time: the Chatterbox
speech server is installed outside this repo, and its `config.yaml` has been
edited before. Ask first, and keep a backup next to the file.

## The machine's settings

Don't change anything that outlives the app closing. No `setx`, no registry
edits, no services, no power plans, no PATH changes, no global installs
(`npm install -g`, `pip install` outside a project virtual environment).

Everything the app's engines need is handed to them when they start, in
`electron/net/childEnv.ts`. That is the only place environment changes belong,
because a child process gets them and nothing else on the machine does.

## Other people's processes

Only ever stop a process this project started. Never `taskkill` or
`Stop-Process` by name — `python.exe` and `node.exe` on this machine belong to
Hermes and to other agents as much as to us.

## The graphics card and the heat

This is the part that actually broke things, and no amount of file discipline
fixes it. The card is a laptop RTX 3070 with 8 GB, and there is only one of it.

**Hermes is the other claimant, through Ollama.** `Ollama.lnk` and
`Hermes_Gateway.vbs` are both in the Windows startup folder, so Ollama is
running from login, and the models it holds are not small — `gemma4:12b-it-qat`
is 7.2 GB, `qwen3.5:9b` is 6.6 GB. Either one is most of the card by itself.
Add Chatterbox's speech model or a Stable Audio run on top and there is nothing
left. What that looks like from the outside is Hermes hanging or refusing to
answer, and a set of processes nobody recognises: `python.exe` (ours),
`ollama.exe` and `ollama_llama_server.exe` (theirs).

So the card is shared by taking turns, and the turn has to be asked for.

- Chatterbox loads a speech model onto the card and **keeps the memory until
  the app is closed**. While the app is open, other programs have less to work
  with.
- Generating sound effects pinned the card at 88 °C for a long stretch. At that
  temperature the card slows itself down, and everything else on the machine
  slows down with it.

So: before starting any long generation run — sound effects, batches of speech,
video renders — **say so and wait for a yes.** If Hermes is in the middle of
something, that is a reason to wait.

## Ports

The app uses `127.0.0.1:8004` for Chatterbox and `127.0.0.1:5501` upwards for
Piper voices. Loopback only — nothing is exposed to the network. If a port is
taken, move ours; don't free theirs.
