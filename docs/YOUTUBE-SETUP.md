# Connecting YouTube — the whole thing, in order

This took several attempts and none of the failures were your fault. Written
down so it never has to be worked out again.

**It is not urgent.** Nothing else waits on it. Lessons render, cards join,
music plays, files land on disk. This is only about putting them on YouTube
without dragging them into a browser by hand.

---

## First, ask where you are

```bash
node tools/youtube-auth.mjs --check
```

It says which of the steps below is missing, and what to run next. Start here
every time, including after something goes wrong.

---

## The setup, once

### 1. In the Google Cloud console

You have already done these. They are listed so the picture is complete.

- A project — `skilitsa-youtube`
- **YouTube Data API v3** enabled in it
- An OAuth client of type **Desktop app** (not "Web application")
- Its JSON downloaded into `C:\Users\strav\Documents\CLAUDE SPACE\SECRETS`

### 2. The consent screen — the step most likely still missing

**APIs & Services → OAuth consent screen.**

While it is in **Testing**, only accounts on its test-user list may sign in.
Everyone else is refused, and the refusal looks like a bug rather than a rule.

Add the Google account that owns the YouTube channel under **Test users**.

A test-mode refresh token also **expires after seven days**. That is fine for
now. Publishing the app removes both limits and needs no review while it is only
you using it.

### 3. Sign in — two steps, minutes apart is fine

```bash
node tools/youtube-auth.mjs --link
```

Open the address it prints. Approve.

**The browser will then fail with "this site can't be reached". That is
correct.** Nothing is listening. The part that matters is now sitting in the
address bar.

Copy the whole address, then:

```bash
node tools/youtube-auth.mjs --code "<paste the address, keep the quotes>"
```

Done. `youtube-token.json` is written beside the client secret.

---

## When it goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "Required parameter is missing: response_type" | The address was cut short. Fixed in the tool — it was opening the browser through `cmd`, which treats `&` as a separator. | Use the current version |
| "This site can't be reached" | Expected in the two-step route | Copy the address, run `--code` |
| "That address is from a different sign-in attempt" | An old browser tab was used | `--link` again, use the NEW address |
| "That code was already used or has expired" | Codes work once, and only for a few minutes | `--link` again |
| "Google did not send a lasting token" | This account already approved the app, so Google will not reissue one | Remove it at myaccount.google.com/permissions, then `--link` again |
| "access_denied" | The account is not on the test-user list | Add it, step 2 above |

---

## Afterwards

Uploads run without you until the token is revoked — or, in Testing mode, for
seven days.

Scheduling is a **publish date**, not a Premiere: the video goes up private and
becomes public at the time given. No countdown, no live chat. That was decided
deliberately; a real Premiere needs a live broadcast alongside the video.
