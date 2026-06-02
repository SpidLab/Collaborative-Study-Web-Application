# Collaborator Guide — Connecting Your Computer to the Study

Welcome! This guide takes you from zero to done. **No coding and no typing of
commands is required** — you'll install one free app, put your data in a folder,
copy a code from the website, and **double-click one file**. That's it.

Total time: about **10–15 minutes**, once.

---

## What this is (in plain words)

The study uses a shared website to coordinate research. The heavy analysis on your
data must run **on your own computer**, so your **raw data never leaves your
machine**. To do that, you run one small background helper — the **Site Agent**.
It quietly waits for tasks from the study, runs them locally, and sends back **only
summary results** (never your raw data).

**The privacy promise**
- ✅ Your raw data stays on your computer. The helper opens it **read-only** — it
  can't change or delete your files.
- ✅ Only safe summaries (filtered marker lists, counts, population coordinates) go
  to the study server.
- ✅ The helper only makes **outgoing** connections. Nothing connects *into* your
  computer — no firewall changes needed.

**The whole journey at a glance**
1. Install **Docker Desktop** (free app) — once.
2. Put your data in a folder (a simple layout, shown below).
3. On the **website**: log in → register your dataset's details (phenotype name +
   number of samples) → copy your one-time **connection code**.
4. On **your computer**: **double-click "Start Agent"** and answer 3 short questions.
   It connects **once** and then stays ready in the background.
5. **Join or start collaborations anytime** — the already-running helper picks up
   your tasks automatically (even ones created while your computer was off).

You set up steps 1–4 **once**. After that you only ever do step 5, and the helper
handles the rest by itself.

> The single most important link to get right: the **phenotype name you type on the
> website must exactly match the data sub-folder name on your computer**
> (e.g. website phenotype `eye_color` ↔ folder `eye_color/rawdata.csv`). That's how
> the helper knows which file a task is about.

---

## Before you start — checklist

- [ ] A Windows or Mac computer you can leave on sometimes.
- [ ] Your genotype data saved as a **CSV** file.
- [ ] The **study link** (your coordinator gives you this — e.g. `https://3-21-x-x.sslip.io`).
      This one link is **both** the website you log into **and** the "server address"
      you'll paste into the helper. (It may look like a string of numbers + `.sslip.io`
      instead of a normal name — that's expected and fine.)
- [ ] The **SiteAgent kit** from your coordinator — usually a **`.zip`**. Save it
      somewhere easy and **unzip it**; inside is the "Start Agent" file you'll
      double-click and this guide. You don't open or edit anything inside it.

---

## Step 1 — Install Docker Desktop (free, one time)

Docker Desktop is the engine that runs the helper safely in the background.

**Mac**
1. Go to <https://www.docker.com/products/docker-desktop/> → download for Mac.
   (Not sure which chip? Apple menu  → *About This Mac*. "Apple M1/M2/M3" = Apple
   chip; otherwise Intel.)
2. Open the downloaded file and drag **Docker** into **Applications**.
3. Open **Docker** from Applications (it may ask for your password the first time).
4. Wait until the whale icon in the top menu bar is steady and says **"running"**.

**Windows**
1. Go to <https://www.docker.com/products/docker-desktop/> → download for Windows.
2. Run the installer → **Next → Next → Finish** (accept defaults). Restart if asked.
3. Open **Docker Desktop** from the Start menu. Wait until the bottom-left corner is
   **green / "running"**.

> Do Step 1 only once. Leave Docker Desktop set to start with your computer (it does
> by default), so the helper can run whenever your machine is on.

---

## Step 2 — Put your data in a folder

Make one **top folder** (anywhere easy), and inside it create **one sub-folder per
dataset**, named exactly like the **phenotype you register on the website**. Each
sub-folder holds a file called **`rawdata.csv`**.

```
collab-data/                     ← your top folder (any name/location)
├── eye_color/                   ← sub-folder name = the phenotype you register
│   └── rawdata.csv
└── blood_pressure/
    └── rawdata.csv
```

**Telling the system who is a case vs a control** — pick whichever is easier:
- **Option A:** include a column named `phenotype` in `rawdata.csv` (**1 = case,
  0 = control**), or
- **Option B:** add two text files next to `rawdata.csv` — `case_ids.txt` and
  `control_ids.txt` — each listing one sample ID per line.

```
blood_pressure/                  eye_color/
└── rawdata.csv (phenotype col)  ├── rawdata.csv (no phenotype column)
                                 ├── case_ids.txt
                                 └── control_ids.txt
```

### The data standard (please follow this exactly)

So everyone's results line up. **If your file came from your lab's standard genotype
export, this is usually already true** — when unsure, ask whoever prepared it.

| Rule | What it means |
|------|----------------|
| **CSV file named `rawdata.csv`** | Plain comma-separated file. |
| **First column = Sample ID** | One row per person; IDs **unique**; same IDs used in the case/control files if you use those. |
| **Other columns = markers (SNPs)** | One column per marker. |
| **Column names = marker IDs (e.g. `rs12345`)** | Use the **same naming the study agreed on**; the same marker has the same name at every site. |
| **Values = 0, 1, or 2** | Copies of the marker's alternate allele. **Leave blank for missing** (don't use 0 for missing — 0 is a real value). |
| **Same export style across the study** | So a `0/1/2` means the *same thing* everywhere (same genome build / pipeline, e.g. GRCh38). Your bioinformatician can confirm in one line. |
| **Case/control** | A `phenotype` column (1/0) **or** `case_ids.txt` + `control_ids.txt`. Needed for GWAS. |

Tiny example of `rawdata.csv`:

```
sample_id,phenotype,rs12345,rs67890,rs11223
NA2000,1,0,1,2
NA2001,0,1,1,0
NA2002,1,,2,1        ← blank = missing genotype
```

### How your data is handled (so there are no surprises)

You **don't** need the same markers as other sites — the system reconciles
differences automatically:
- **Markers not in the study's shared reference are skipped for the
  population-similarity step only** (Population Stratification) — they're still used
  in your QC checks and in GWAS, so nothing is wasted.
- **Missing some reference markers is fine** — they're filled in neutrally. **Extra**
  markers are fine too — just skipped for that one step.
- **Sharing almost none of the reference markers** → the population step is skipped
  for your dataset (expected, not an error); everything else still runs.
- **Two sites with different markers still work** — each is lined up against the
  shared reference independently, so results stay comparable.
- **Your file is fingerprinted** when registered — if you edit it later, re-register
  it on the website.

---

## Step 3 — On the website

Everything in this step is done in your **web browser** on the study website. (The
website is just for coordinating — your actual genetic data never goes here.)

### 3a. Create an account / log in
1. Open the study website address your coordinator gave you.
2. **Register** (name, email, password) or **Log in** if you already have an account.

### 3b. Register your dataset's details (metadata only)
This tells the study *that* you have a dataset and *how big* it is — **not the data
itself.** The data stays on your computer.

1. Go to the **Upload / "Enter Metadata Details"** page.
2. Fill in two fields:
   - **Phenotype(s):** the dataset name. **Type it exactly the same as your local
     sub-folder** (e.g. `eye_color`). This is the link between the website and your
     computer.
   - **# of Samples:** how many individuals are in that dataset (e.g. `20`).
3. Click **Submit.** You'll see "Metadata uploaded successfully."

> No file is uploaded here — only the name and the sample count. Repeat 3b for each
> dataset you have (one per phenotype/folder).

### 3c. Get your connection code
This is a **one-time login for the helper** — it lives on your **Edit Profile**
page. **Do this before joining any collaboration**, so your helper is ready and
waiting. It's a little tucked away, so follow these clicks exactly:

1. Look at the **top-right corner** of the website and click your **account icon**
   (the round avatar / circle with your initials or a person symbol).
2. A small menu drops down. Click **"Edit Profile."**
3. The Edit Profile page opens. **Scroll down** — past the Name, Email, and Password
   boxes — to a box titled **"Connect my computer."**
4. In that box, click the **"Generate connection code"** button.
5. A long code appears just below the button. Click **"Copy code"** (the button next
   to it). It's a long string of random-looking letters and numbers — that's normal,
   and you don't need to read or understand it.

The code is now on your clipboard — go straight to Step 4 and paste it when asked.
(If you wait too long, see the note below and just generate a fresh one.)

> **You only ever need a code once.** The code itself expires in **24 hours**, but as
> soon as the helper uses it, the helper saves a permanent login — so you **never need
> a new code** for new collaborations or after restarting your computer. You'd only
> generate another one if you completely reset the helper, or if the code expired
> before you used it (just repeat 3c to get a fresh one).

---

## Step 4 — Start the agent (double-click, no typing)

Open the **SiteAgent folder** your coordinator gave you.

**Mac** — double-click **`Start Agent.command`**.
- First time only, macOS may warn it's from an unidentified developer. If so:
  **right-click** the file → **Open** → **Open**. (You only do this once.)

**Windows** — double-click **`Start Agent.bat`**.
- If Windows SmartScreen warns, click **More info → Run anyway** (one time).

A window opens and asks **three short questions**:
1. **Study server address** — paste the website address from your coordinator.
2. **Your top data folder** — the folder from Step 2 (e.g. `collab-data`).
3. **Your connection code** — paste the code you copied in Step 3.

The helper then checks Docker, sets everything up, and starts. When you see
**"Agent started"**, you're done with setup. 🎉 You can close the window — it keeps
running in the background and restarts automatically when you turn your computer on.

Your helper is now **enrolled once and ready for everything** — you won't touch any
of Steps 1–4 again.

---

## Step 5 — Join or start collaborations (anytime)

With the helper already running and ready, this is all you do from now on. It can
happen **before or after** the helper started — order doesn't matter, because tasks
wait until your helper is online.

- **If you were invited to a study:** on the website open **Invitations** (or the
  Collaborations page), find the study, and click **Accept** (pick your matching
  dataset/phenotype if asked).
- **If *you* are starting a study (initiator):** open **Start Collaboration**, give
  it a name, pick the **GWAS** experiment, choose the **QC scheme** (your coordinator
  says which — e.g. MAF / HWE / Missing; add Population Stratification only if your
  data matches the study's reference panel), select **your dataset**, and **invite**
  collaborators by email.

Once everyone invited has accepted, the study automatically queues the analysis
tasks for each person's computer. Your already-running helper **picks up your task
on its own** — nothing else for you to do. Watch progress on the website (or with
the optional `logs` command below).

> No new connection code is needed for each collaboration — your helper is already
> logged in. Just accept/create studies and it handles them.

---

## Step 6 — Run the analysis and view results

This all happens **on the website**, and is mostly done by the **study initiator**
(the person who started the collaboration). Invited collaborators usually just keep
their helper running and watch the results appear. **The page updates by itself —
you do not need to refresh your browser** after clicking these buttons; the next
stage appears automatically once everyone's helper has finished its part.

Open the collaboration's **Details** page. The **Collaboration Status** panel on the
right shows which stage you're in. The buttons appear as each stage becomes ready:

1. **QC runs automatically.** When collaborators accept, each one's helper runs the
   QC locally and uploads its results. You'll see the status move past "Onboarding."
   - For filter-only schemes (MAF / HWE / Missing), it goes straight to the GWAS
     stage — there's no extra QC button to press.
   - For schemes with **Population Stratification** or **Sample Relatedness**, the
     initiator clicks **"Initiate QC Calculation,"** then **"Get QC Results,"** and
     sets a cutoff with **"Confirm Threshold."**
2. **Create the GWAS dataset.** Click **"Create GWAS Dataset."** Each helper computes
   its per-marker case/control counts locally and uploads them. (Keep helpers
   running.) The status advances on its own when they're done.
3. **Run the analysis.** Click **"Initiate GWAS Calculation."** The server combines
   everyone's counts and runs the statistics.
4. **See the results.** Click **"Get GWAS Results"** to view the results table.
   Optionally click **"Generate Summary"** for a plain-language one-page summary.

> If a button says results aren't ready yet, just wait a few seconds — the page
> refreshes itself as each collaborator's helper reports in. You don't need to
> reload.

---

## Day-to-day — what to expect

- **You don't have to do anything.** The helper waits for tasks and handles them.
- **You don't need the website open** or to stay logged in — the helper has its own
  saved login.
- **Tasks can arrive anytime.** If your computer was off or asleep when a task was
  created, no problem — it's picked up the next time you're on and online.
- **Results appear on the website** for the study team once your helper finishes.

### If you ever need to check or control it (optional)

Easiest: just **double-click "Start Agent" again** — it will make sure the helper is
running. For more control, open the SiteAgent folder in Terminal (Mac) / PowerShell
(Windows) and use:

| What you want | Mac | Windows |
|---|---|---|
| Is it running? | `./collab-agent.sh status` | `.\collab-agent.ps1 status` |
| Watch it work | `./collab-agent.sh logs` | `.\collab-agent.ps1 logs` |
| Stop it | `./collab-agent.sh stop` | `.\collab-agent.ps1 stop` |
| Update it | `./collab-agent.sh update` | `.\collab-agent.ps1 update` |
| Start over | `./collab-agent.sh reset` | `.\collab-agent.ps1 reset` |

A healthy helper logs `Agent running. Polling for jobs ...` and, when work arrives,
`Job ... complete; uploaded keys=[...]`.

---

## Troubleshooting

**"Docker is not installed / not running"**
Open **Docker Desktop** and wait until it says *running* (steady whale / green), then
double-click "Start Agent" again.

**Mac: "Start Agent" won't open (unidentified developer)**
Right-click the file → **Open** → **Open**. You only need to do this the first time.

**Windows: SmartScreen blocked it**
Click **More info → Run anyway** (one time).

**"No dataset for phenotype 'xxx'"**
The task needs a dataset you don't have locally. Check your top data folder has a
sub-folder named exactly `xxx` with a `rawdata.csv` inside.

**"...does not match the registered hash"**
Your `rawdata.csv` changed after you registered it. Re-register the dataset on the
website (or restore the original file), then it runs.

**"Invalid or expired connection code"**
Codes expire after 24 hours. Generate a fresh one (Step 3), then double-click "Start
Agent" again and paste the new code.

**It can't reach the server**
Check your internet and that the server address is right. The helper keeps retrying,
so it resumes on its own once you're back online.

---

## Frequently asked questions

**Does my raw genetic data ever get uploaded?**
No. Raw files are read on your computer only (read-only). Only summarized,
privacy-safe outputs are sent.

**Do I need a new connection code for each collaboration, or each time I restart?**
No — just **once, ever.** The helper turns your one-time code into a saved login that
covers **all** your collaborations and survives restarts and computer reboots. You'd
only need a fresh code if you fully **reset** the helper.

**Should I set up the helper before or after joining a study?**
Either works, but **setting it up first is best** — then it's ready and waiting. If a
task is created while your helper is off, it simply waits and runs when you're next
online.

**Do I have to keep a window open?**
No. It runs in the background — you can close the window after it starts.

**What if I turn off or restart my computer?**
It restarts automatically with your computer (as long as Docker Desktop is running).
Tasks that arrived while you were off are picked up afterward.

**Do I need the same markers (SNPs) as other sites?**
No. You can have more or fewer — the system lines each site up against a shared
reference automatically. Just follow the data standard above.

**Why does it say some of my markers weren't used?**
For the population-similarity step, only markers in the study's shared reference can
be used (everyone is compared on the same "ruler"). Extras are skipped *for that step
only* — still used in your QC and GWAS, so nothing is wasted.

**My dataset has fewer markers than the reference — is that OK?**
Yes, as long as you share a good chunk of them (missing ones are filled in
neutrally). If you share almost none, that one step is skipped for you — expected.

**Will this slow down my computer?**
Only briefly while it's actively working on a task, and tasks are occasional.

**How do I remove it completely?**
In the SiteAgent folder run `./collab-agent.sh reset` (Mac) or `.\collab-agent.ps1
reset` (Windows). You can then quit/uninstall Docker Desktop if you like.

**Who do I contact for help?**
Your study coordinator. Sending them the output of the **logs** command (above) helps
them help you fast.
