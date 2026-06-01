# Collaborator Guide — Connecting Your Computer to the Study

Welcome! This guide walks you through everything, step by step. **No coding or
command-line experience is needed.** If you can install an app and copy-paste a
code, you can do this.

---

## What is this, in plain words?

Your study uses a shared website to coordinate research. The heavy analysis on
your dataset needs to run **on your own computer** so that your **raw data never
leaves your machine**. To make that happen, you install one small background
helper — the **Site Agent** — once. After that it quietly waits for tasks from
the study, runs them on your computer, and sends back **only summary results**
(never your raw rows).

### The privacy promise
- ✅ Your raw data files stay on your computer. They are opened **read-only** — the
  helper cannot change or delete them.
- ✅ Only safe summaries (filtered marker lists, counts, anonymized coordinates)
  are sent to the study server.
- ✅ The helper only makes outgoing connections. Nothing can connect *into* your
  computer; you don't need to change any firewall settings.

### What you'll do (10–15 minutes, once)
1. Install **Docker Desktop** (a free app).
2. Put your data file(s) in a folder.
3. Get a one-time **code** from the website.
4. Run the **setup helper** and answer 3 questions.

That's it. After that it runs by itself.

---

## Before you start — a checklist

- [ ] A Windows or Mac computer you can leave on sometimes.
- [ ] Your data file(s), saved as **CSV**.
- [ ] The **website address** of the study (your coordinator gives you this).
- [ ] About 15 minutes.

---

## Step 1 — Install Docker Desktop (free)

Docker Desktop is the engine that runs the helper. You install it once.

**Mac**
1. Go to <https://www.docker.com/products/docker-desktop/> and download for Mac.
   (If unsure whether your Mac is "Apple chip" or "Intel chip": click the Apple
   logo  → *About This Mac*. "Apple M1/M2/M3" = Apple chip.)
2. Open the downloaded file and drag **Docker** into **Applications**.
3. Open **Docker** from Applications. The first time, it may ask for your password.
4. Wait until the little whale icon in the top menu bar stops animating and Docker
   says **"running"**.

**Windows**
1. Go to <https://www.docker.com/products/docker-desktop/> and download for Windows.
2. Run the installer and click **Next → Next → Finish** (accept the defaults).
3. Restart your computer if it asks you to.
4. Open **Docker Desktop** from the Start menu. Wait until it says **"running"**
   (bottom-left corner turns green).

> You only ever need to do Step 1 once. Leave Docker Desktop set to start with your
> computer (it does by default).

---

## Step 2 — Put your data in a folder

1. Make a top folder somewhere easy, for example:
   - Mac: `/Users/yourname/collab-data`
   - Windows: `C:\Users\yourname\collab-data`
2. **Inside it, create one folder per dataset, named exactly like the phenotype you
   register on the website.** Put that dataset's raw file inside as `rawdata.csv`.

```
collab-data/
├── eye_color/                 ← folder name = the phenotype you register
│   └── rawdata.csv
└── blood_pressure/
    └── rawdata.csv
```

**How to tell us who is a case vs a control** — pick whichever is easier; both work:

- **Option A — a column in the file:** `rawdata.csv` has a column named
  `phenotype` (or `status` / `group`) with **1 = case**, **0 = control**.
- **Option B — two small text files** next to `rawdata.csv` in the same folder:
  `case_ids.txt` and `control_ids.txt`, each listing one sample ID per line.

```
blood_pressure/                 eye_color/
└── rawdata.csv  (has a          ├── rawdata.csv  (no phenotype column)
    phenotype column)            ├── case_ids.txt
                                 └── control_ids.txt
```

In `rawdata.csv` the **first column** is the sample/individual ID and the other
columns are the genetic markers (SNPs). Each dataset keeps its own case/control
files, so different datasets can have completely different case/control lists. If
you're unsure, your coordinator can confirm the format.

---

## Step 3 — Get your one-time code from the website

1. Log into the study website in your browser.
2. Open your account menu and choose **"Connect my computer"** (your coordinator
   can point you to it).
3. Click to generate a **code** and copy it. (It's long and looks like random
   letters — that's normal.)

Keep that code handy for the next step. You'll paste it once.

---

## Step 4 — Run the setup helper (the easy part)

You were given the **SiteAgent folder** (the folder this guide is in). Open it.

### On Mac
1. Open the **Terminal** app (press ⌘+Space, type "Terminal", press Enter).
2. Type `cd ` (with a space), then **drag the SiteAgent folder onto the Terminal
   window** and press Enter. This moves you into the folder.
3. Type this and press Enter:
   ```
   ./collab-agent.sh
   ```
4. Answer the three questions (server address, your data folder, your code).
   The helper checks Docker, builds the agent, and starts it.

### On Windows
1. Open the **SiteAgent** folder in File Explorer.
2. Right-click **`collab-agent.ps1`** → **Run with PowerShell**.
   - If it says scripts are disabled, open PowerShell from the Start menu, paste
     `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, press Enter, type `Y`,
     then try again.
3. Answer the three questions (server address, your data folder, your code).

When you see **"Agent started"**, you're done. 🎉 It now runs in the background
and starts automatically whenever you turn your computer on.

---

## Day-to-day — what to expect

- **You don't have to do anything.** The agent waits for tasks and handles them.
- **You don't need the website open**, and you don't need to stay logged in. The
  agent has its own saved login.
- **Tasks can arrive any time.** If your computer is off or asleep when a task is
  created, that's fine — the task waits, and the agent picks it up the next time
  your computer is on and connected to the internet.
- **Results appear on the website** for the study team once your agent finishes.

### Handy commands (optional)

Run these from inside the SiteAgent folder (Terminal on Mac, PowerShell on Windows).
Replace `./collab-agent.sh` with `.\collab-agent.ps1` on Windows.

| What you want | Command |
|---|---|
| See if it's running | `./collab-agent.sh status` |
| Watch what it's doing | `./collab-agent.sh logs`  (press Ctrl+C to stop watching) |
| Stop it | `./collab-agent.sh stop` |
| Start it again | `./collab-agent.sh start` |
| Update to the newest version | `./collab-agent.sh update` |
| Start over from scratch | `./collab-agent.sh reset` |

A healthy agent's logs say something like:
`Agent running. Polling for jobs ...` and, when work arrives,
`Job ... complete; uploaded keys=[...]`.

---

## Troubleshooting

**"Docker is not installed" / "Docker is not running"**
Open the **Docker Desktop** app and wait until it says *running* (whale icon
steady / green). Then run the helper again.

**"running scripts is disabled" (Windows)**
In PowerShell run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`,
press `Y`, then try again.

**"No dataset for phenotype 'xxx'"**
The agent was asked to work on a dataset it can't find. Check that your data folder
has a sub-folder named exactly `xxx` (matching the phenotype on the website) with a
`rawdata.csv` inside it.

**"does not match the registered hash"**
Your local file changed after you registered it. Re-register the dataset's metadata
on the website (or restore the original file), then it will run.

**"Invalid or expired enrollment code"**
Codes expire after a day. Generate a fresh code on the website and run
`./collab-agent.sh reset` then `./collab-agent.sh` again.

**It can't reach the server**
Check your internet connection and that the server address is correct. The agent
keeps retrying automatically, so once you're back online it resumes on its own.

**I want to move my data folder**
Run `./collab-agent.sh reset`, then `./collab-agent.sh` and enter the new folder.

---

## Frequently asked questions

**Does my raw genetic data ever get uploaded?**
No. Raw files are read on your computer only, mounted read-only. Only summarized,
privacy-safe outputs are sent.

**Do I have to keep a window open?**
No. It runs in the background. You can close Terminal/PowerShell after it starts.

**What if I turn off or restart my computer?**
The agent restarts automatically with your computer (as long as Docker Desktop is
running). Any task that arrived while you were off will be picked up afterward.

**Will this slow down my computer?**
Only briefly while it's actively crunching a task, and tasks are occasional.

**How do I remove it completely?**
Run `./collab-agent.sh reset` (or `.\collab-agent.ps1 reset`). You can also quit
Docker Desktop and uninstall it if you no longer need it.

**Who do I contact for help?**
Your study coordinator. Sending them the output of `./collab-agent.sh logs` helps
them help you faster.
