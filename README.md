# EV3 Simulator

A web app to program a LEGO® MINDSTORMS® EV3 robot with blocks, in the style of EV3 Classroom, and see the result live in a simulator. It is built for student practice and assessment. Nothing needs to be installed and no internet connection is required.

## In class

1. **Teacher:** on your computer, double-click `start.command`. A window opens and shows:
   - the **public link** for students, e.g. `https://xxxx.trycloudflare.com/`. It works from any network, through a free Cloudflare tunnel with no account. The first launch downloads the tunnel tool into `tools/`.
   - the **teacher password** (`prof2026`, or the `TEACHER_CODE` environment variable), only needed to open the dashboard from another computer.
   The teacher dashboard opens in your browser with the link and a QR code. **📺 Show to the class** displays them in large size for the projector.
   - Keep the window open and the computer awake during the lesson.
   - The link changes at each launch: always take it from the dashboard.
2. **Students:** open the link, choose their **class** then their **name** in the class lists (`js/roster.js`, one line per class, editable) (or scan the QR code), then choose:
   - **Guided challenges:** 10 challenges, step by step;
   - **Free programming:** playground with 7 mats.
3. **Next challenge:** when "Check my solution" reaches 80 % (`passScore` in `js/config.js`), the challenge is passed and the next one unlocks (**Next challenge →**). In the dashboard, **Unlock next** lets a stuck student move on.
4. **Saving:** the work (all programs and progress) is **saved automatically on the class server** every few seconds ("☁️ Saved online" in the header).
   - The **first name is the only identifier** (accents, case and spaces ignored; the class is just extra information). Next time, students type the same first name, or click it in the suggestions, and choose **Continue my work**. This works from any computer.
   - If two students have the same first name, the second one clicks "This is not me" and adds an initial ("Léa M.").
   - **💾 Save my work** also downloads a copy (`Lea_9B_EV3-work.json`). Students can reopen it with **Continue from my saved file**, e.g. if the server is off.
   - If the server cannot be reached, the header says so and a reminder asks students to download their work.
   - Saved work is kept in `data/db/` on the teacher's computer (online: in the Upstash database).

## Teacher dashboard (`teacher.html`)

- **Live class** (needs the class server), refreshed every 3 seconds. No password on the teacher's computer; elsewhere it asks for the teacher password. **From the welcome page:** the discreet **👩‍🏫 Teacher** button (bottom right) asks for the password and opens the dashboard; **Log out** in the dashboard forgets it on that computer. For each student it shows:
  - progress through the challenges and the current challenge;
  - time spent and number of runs;
  - best check score;
  - status: programming, running a program, checking a solution, offline;
  - difficulty level.
  Students who need help are listed first.
- **See a student's code:** click any dot of the progress bar. The student's code for that challenge opens, in the live dashboard, the saved-files report or the Manage tab. The view refreshes live, a menu switches between challenges, and **▶ Run their program** runs it on that challenge. **👁 View** opens the current challenge.
- **Details** per student:
  - challenge-by-challenge stats: time, runs, checks, hints, recurring errors, failed criteria;
  - recent activity;
  - saved programs (from files).
- **Difficulty report** (printable / PDF, and CSV for Excel):
  - per challenge: median time and runs, most common error, most failed criterion;
  - per student: level (🟢 at ease / 🟠 some difficulties / 🔴 needs help) and concrete findings, e.g. "uses the wrong port numbers for sensors (7×)", "has not passed yet after 3 solution checks", "used all the hints", "seems stuck on this challenge right now".
- **⚙️ Manage:**
  - **Class settings:** pass score, download reminder, allow guided and/or free mode. Students get them within 30 s.
  - **Students:** fix a first name or class, unlock challenges up to a given one, reset progress, download a student's work, delete. Works for one student or a selection.
  - **Backup:** download all work in one file, or restore from a backup or from work files.
  - **Reset everything** (new class / new year), after typing RESET.
  - Before any deletion or reset, a copy of everything is kept 180 days (plus the daily backups, 30 days).
  - Students who are connected see the change right away: their work is reloaded, or they go back to the welcome screen after a reset. Their browser cannot overwrite the teacher's change.
- **Report from saved files:** drop the students' work files to get the same view and report without the server.

## FIRST LEGO League practice (BIOGLOW, 2026-27)

A third mode on the welcome screen, **🏆 FIRST LEGO League**, lets students practise the robot game of the current FLL Challenge season, **BIOGLOW** (FIRST CANOPY).

- **Table:** 202 × 114 cm mat on a 236 cm table with storage strips. The two launch areas (quarter circles), the three black lines and every mission model are at their position on the official wireframe (20 cm grid). The rainforest artwork is our own drawing, not the official mat art.
- **15 missions with official points:** Drone Survey, Exploding Seeds, Flip the Rock, Lucky Leaves (random katydid), Reaching Roots, Leafcutter Frenzy, Humongous Fungus, Tangled, Research Platform, Fragile Microhabitats, Window to the Past, Forest Elder, Keystone Species, Seeds of Renewal, Biocentric Architecture.
  - Equipment inspection (20) and precision tokens (6 tokens, up to 50) are included.
  - The interchangeable docks (mine, city, farm) for M13-M15 can be chosen before the match, with the environmental bonus of M15.
- **Match rules:**
  - 2:30 clock that keeps running between launches.
  - The robot can only be launched, and handled, inside home.
  - **Rescue robot** brings it back but removes a precision token.
  - Live score sheet; mission details with what to do in the simulator.
  - Final score sheet; matches and best score are saved for the teacher.
- **2D adaptation of the mechanisms:**
  - Push a part: launcher slider, root lever, ant, handles.
  - Swing the arm (motor A, front arm) in front of a model (yellow zones).
  - Push loose objects (seeds, keystone species) into an area.
  - Avoid the fragile habitats.
  - M06: push the ant slowly, or the leaves scatter.
  - M07: the connection bonus needs an opposing team, so it cannot be scored here.
- **3D view (🧊 3D button in the simulator toolbar, FLL mode only):**
  - Same match, drawn in 3D: the models move when a mission is done (drone takes off, rock flips, vine drops, cover falls, building parts open…).
  - A green "+points" label rises above each mission when it scores.
  - Cameras: **Table**, **Follow robot**, **Top**; drag to turn, scroll to zoom. The robot can still be dragged inside home.
  - The simulation itself stays the 2D one (same results); 3D is only the picture. Uses three.js (local, offline).
- **Teacher:** students in this mode show "🏆 FLL" with their best score. Their FLL code can be viewed and run on the BIOGLOW table. A setting can turn the mode off. FLL scores are in the CSV export.
- **Sources:** official FIRST LEGO League Challenge 2026-27 BIOGLOW Robot Game Rulebook, Field Setup Guide and Wireframe. Always check the official Challenge Updates for rule changes.

## Classroom tools (teacher dashboard)

- **🔑 Class code:** students need it to open the app (class lists, saving…). It is **inside the link and the QR code** of the live view, so students who scan or click get in directly; others type it once on the welcome page (the device remembers it). Online, a 6-digit code is created automatically; change it in Manage → Class settings (empty = open to anyone with the address). If you change it during a lesson, connected students are asked for the new one. The class lists are never in a public file (`api/_roster.json` is only the default, served with the code).
- **🙋 Help requests:** students click **I need help** (top bar). The dashboard shows a queue at the top of the live view (oldest first, with a sound for each new request) and a 🙋 next to the student. **👁 View** opens their program, **✓ Done** tells the student their teacher has seen it.
- **Class lists:** Manage → *Class lists*: one box per class, one name per line, **+ Add a class**, **📋 Paste from Excel** (two columns: class, name). Saved online; the welcome page uses them at once (`js/roster.js` is only the default).
- **Commands for a class** (buttons in each class header of the live view):
  - **📢 Message**: shown on every screen of the class;
  - **⏸ Pause screens**: "Eyes on your teacher" on every screen (running programs stop) until **▶ Resume**;
  - **🔒 Close access**: the class is greyed out on the welcome page and connected students see "Your class is closed" (work saved) until **🔓 Open access**.
- **📝 Exams:** **Start an exam** in a class header: title, duration, challenges, hints allowed or not.
  - The students of that class switch to the exam within a few seconds: countdown, only the chosen challenges, each from an **empty program** (their practice work is kept apart), no mode switching.
  - Only their **best "Check my solution"** counts. At the end of the time (or **⏹ Stop**) they see their scores; **✓ Back to normal** returns them to their usual work.
  - **Results**: best score per challenge, number of checks, average and **Swiss grade**, CSV export, click a score to see the program. **🔁 Verify by replaying the programs** re-runs every saved program on the official trials (deterministic) and flags any score that differs.
  - All exams: **📝 Exams & results** in the live view.
- **🕓 Program history:** a version is kept at every **Run** (when the program changed) and every **Check** (with its score), the last 25 per program. In the student view (👁 or a progress dot), the history bar shows each version: click one to see it and run it, **● Now** to come back.
- **💬 Comments on blocks:** in the student view, click a block of their program, then **Comment on the selected block**. The student sees a ⚠ bubble on that block and a *Comments from your teacher* panel (**Show the block**, **Got it ✓**). The dashboard shows whether each comment was read.
- **💾 Daily backups:** made automatically once a day (Vercel cron job, and when the dashboard is open), kept 30 days, listed in Manage with **⬇ Download** and **↩ Restore**. **Make a backup now** for an extra one.
- **Database usage** (Manage): operations used this month against the free quota, forecast for the month, data size.

## Online hosting (Vercel)

The app can also run on Vercel, with a fixed address (no computer to keep on, no tunnel).

- **What is deployed:** the static app and `api/index.py`, the same API as `server.py` but storing the data in an **Upstash Redis** database (Vercel has no permanent disk). `data/`, `tools/`, `server.py` and the tests are not deployed (`.vercelignore`), and `data/` and `tools/` never go to GitHub (`.gitignore`).
- **Settings in Vercel** (Project → Settings → Environment Variables):
  - `TEACHER_CODE` (optional): the teacher password. Without it, the password is `prof2026`. Always asked online.
  - `KV_REST_API_URL` / `KV_REST_API_TOKEN`: added automatically when the Upstash Redis database is connected (Storage tab).
- **Region:** functions in Frankfurt (`fra1`, `vercel.json`); choose Frankfurt (eu-central-1) for the database too.
- **Online, browsers talk to the server less often** (save every 8 s when something changed, otherwise every 30 s; teacher checks every 10 s) to stay within the free quotas.
- **Moving the class data from the local server:** in the local dashboard, Manage → backup (download), then in the online dashboard, Manage → restore.
- **Test before deploying:** `python3 tests/vercel_local.py` runs the app like on Vercel on this computer (teacher code 123456, temporary database in memory).
- **Updating:** every `git push` to GitHub redeploys the site automatically.
- `server.py` and `start.command` still work for a lesson without internet hosting.

## Student app

- **Blocks like EV3 Classroom:** continuous palette with Motors, Movement (steering dial), Display, Sound, Events, Control, Sensors, Operators, Variables (with lists) and My Blocks. Sensor blocks show the sensor icon and the port.
- **Several stacks run in parallel** with all event hats. Running blocks glow. Errors are shown on the simulator, and the faulty block is selected.
- **Port View** (hidden by default): open it with the **Port View** button at the top left of the workspace, or from the simulator toolbar. It is a movable panel like in EV3 Classroom:
  - the brick in the middle, with its screen and status light;
  - motors A–D on top and sensors 1–4 below, with live values;
  - a menu on each device to choose what to show (Degrees / Rotations / Current Speed, Angle / Rate, Reflected Light Intensity / Ambient / Color, …).
  The **Robot setup** tab sets the sensor (type, mount position) and the motor (type, role) on every port, or a preset.
- **2D simulator:** motor physics, color / ultrasonic / infrared / gyro / touch sensors, LCD, status light, brick buttons, sounds.

## Differences from EV3 Classroom

- No connection to a real robot (Bluetooth/USB) and no import of EV3 Classroom `.lmsp` files.
- Top-down 2D simulation. Objects cannot be pushed, and the arm motor is only visual.
- Smaller image and sound libraries (18 images, 25 sounds).
- My Blocks inputs are used through variable blocks of the same name (Blockly), not argument reporters as in Scratch.

## Adding a challenge

Challenges live in `js/world.js` (`CHALLENGES` array):

- `setup(rng)` returns the mat, obstacles and start pose.
- `step(ctx)` tracks progress during a trial.
- `evaluate(ctx)` returns the scored criteria.

Open `tests/selftest.html` through the server (for tests, run it with `EV3_DATA_DIR=/tmp/ev3test python3 server.py 8765` so that the class data in `data/` is never touched) to check that everything still works:

- each challenge has a reference solution that must score 100 %;
- an empty program must score 0 %;
- language, wrong-port error, 2-sensor line follower and beacon follower tests.

## Structure

```
index.html / teacher.html   student / teacher pages
js/sim.js                   physics, motors, sensors, robot configuration
js/blocks.js                blocks, toolbox, theme
js/generator.js             blocks → JavaScript
js/runtime.js               execution (threads, events, robot API)
js/brick.js                 LCD, sound, status light
js/world.js                 mats and challenges
js/evaluator.js             challenge grading
js/render.js                simulator drawing
js/fll.js / js/fll3d.js     FLL BIOGLOW table, missions, score / 3D view
js/portview.js              Port View / configuration tiles
js/progress.js              student progress, save file, live sync
js/classroom.js             student side of the classroom tools (help, comments, class commands, exams, history)
js/teacher-classroom.js     dashboard side of the classroom tools, class lists, backups, database usage
js/roster.js                default class lists
js/analysis.js              difficulty analysis for the report
js/config.js                classroom settings (pass score, save reminder)
js/app.js / js/teacher.js   student app / teacher dashboard
api/_core.py                the API (shared): storage on disk (data/db/) or in Upstash Redis
api/index.py                Vercel wrapper of the API
tests/apitest.py            tests every API endpoint (python3 tests/apitest.py URL password)
tests/vercel_local.py       runs the app like on Vercel, locally
server.py                   class server (app + live progress API + public link). Data in data/; data/ and tools/ are never served
lib/                        Blockly 11, continuous toolbox, QR code, three.js (local, offline)
```

LEGO® and MINDSTORMS® are trademarks of the LEGO Group. This project is independent and not affiliated with the LEGO Group.
