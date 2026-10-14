# Assessment Library — Guide

Settings → Clinical Settings → Assessment Library

The Assessment Library is your clinic's own set of psychological questionnaires. Each one is a **template** with questions, a scoring method and severity bands. Build one here, then use it in two ways:

- **In the clinic** — log a score against the patient in the Psychology workspace → Psychometrics tab.
- **With the patient** — send a secure link; the patient answers on their phone and the score returns automatically.

**The flow in one line:** Category → Template → Questions → Scoring → AI rules → Activate → Use / Send.

> You do not need to build the standard tests yourself — use **Import** to copy PHQ-9, GAD-7, BDI-II, PCL-5 and more in one click, then edit if you wish.

---

## Step 1 · Organise with categories

Categories are folders that keep the list tidy. They are optional, but helpful once you have several tests.

- Go to Settings → Clinical Settings → Assessment Library.
- Click **Edit categories**, then add names like Anxiety, Depression, ADHD & Attention, Trauma.
- Each template is filed under one category (or left **Uncategorised**).
- Filter templates by category using the chips above the list.

---

## Step 2 · Start a template

**Option A · Import a standard instrument**
Copies a ready-made test (questions + scoring + bands) into your library so you can use and edit it. Best when a published test already fits.

**Option B · Create assessment**
Starts a blank template for your own questionnaire, rating scale or checklist.

> New templates save as **Draft** (hidden from use) until you activate them.

---

## Step 3 · Write your questions

Each question has a **type**, **options** (a label and a numeric value), and an Optional toggle. The type decides how the patient answers and how it scores — so pick the one that matches the test.

| Type | Patient action | Best for | Example |
| --- | --- | --- | --- |
| **Single choice** | Picks one option | Likert scales and severity/frequency items; the score is that option's value | "Little interest or pleasure?" → Not at all / Several days / More than half the days / Nearly every day |
| **Scale** | Picks one point | A single point on a numeric scale; works like single choice | Pain today → 0 · 1 · 2 · … · 10 |
| **Multiple choice** | Picks many | Symptom checklists and "select all that apply"; the score is the **sum** of every selected option's value | "Which apply to you?" → Sleep problems, Low appetite, Fatigue |
| **Free text** | Types an answer | Open/qualitative answers the clinician reads. **Never scored**, and it blocks the online patient link | "Describe your sleep in your own words." |

> Tip: give every option a **value** (0, 1, 2, 3…). Consistency across questions is what makes the total score meaningful.

---

## Step 4 · Set up scoring

- **Sum** — adds every answer. The usual choice, and the only method allowed for online patient links (e.g. PHQ-9).
- **Average** — mean of the answered items. Use when items are on the same scale and you want an average.
- **Manual** — no automatic score; the clinician enters it. For clinician-scored tools.

**Max score** — the ceiling of the test (e.g. 27 for PHQ-9). It bounds the score input and the trend bar in the patient's history.

**Severity bands** — ranges that map a score to a label, e.g. 0–4 Minimal, 5–9 Mild, 10–14 Moderate. The severity field fills itself from these, so the clinician does not retype it.

> Bands must be **ascending and non-overlapping** (no gaps, no overlaps) — otherwise they will not save.

---

## Step 5 · AI interpretation rules

Rules are short guidance texts mapped to a score range, e.g. _"10–14 Moderate: discuss sleep and activity scheduling."_

- Add one rule per score range that matters for your practice.
- When a result comes in, open the row in Psychometrics and click **AI interpretation**.
- The assistant writes a short clinician-facing summary from this rule + the severity + the answers.
- If the assistant is unavailable, the authored rule text is shown on its own.

> The interpretation is decision support for the clinician — not a diagnosis, and it is never shown to the patient.

---

## Step 6 · Activate & use it

Move the template from **Draft** to **Active** from its "More" menu. Active templates appear in two places:

**Psychology → Psychometrics**
Pick it in the Assessment list, enter the score (severity auto-fills), and record. Scores build a trend history.

**Send patient links**
Choose it in the *Send assessment* dropdown and send over WhatsApp. The patient answers on their phone and the score returns automatically.

> A template shows an **Online** badge only when it can be sent to patients (see FAQ).

---

## Tips & FAQ

**Why doesn't my template show an "Online" badge?**
Online needs all three: status **Active**, scored with the **Sum** method, and at least one non-free-text question. Remove free-text items for sendable tests.

**Severity isn't auto-filling.**
Add ascending, non-overlapping bands in Step 4, then save.

**Can I edit a test after using it?**
Yes. Past recorded results keep their own name and score; only the template moves forward.

**Who can build tests?**
Owners and admins. All clinic members can use active tests in the workspace.
