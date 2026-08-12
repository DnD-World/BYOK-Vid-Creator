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
