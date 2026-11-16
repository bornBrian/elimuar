# ElimuAR mobile (Unity)

The ElimuAR Android app: sign-in for students and teachers, the activity
library, assignments, teacher class progress, offline downloads, and the AR
activity player (Setup → Observe → Explore → Questions → Summary → Score).

Unity **6000.6.2f1**, URP, AR Foundation + ARCore. Everything (screens, AR
rig) is built in code under `Assets/ElimuAR/Scripts`; there is one empty scene.

## Build

From the repo root:

```bash
npm run mobile:setup   # once, and after changing ElimuBuild.cs: fonts, URP, XR, materials, player settings
npm run mobile:build   # -> apps/mobile/Builds/ElimuAR.apk, also copied to apps/web/public/downloads/elimuar.apk
```

Logs go to `apps/mobile/Logs/setup.log` and `build.log`.

## Content

The app plays the activities published in the web console (**Admin → AR
Activities**). Each activity is a Unity activity bundle; when it is uploaded,
the API runs `apps/api/tools/extract_activity.py` (Python + `pip install UnityPy`)
to read the bundle's steps, narration captions, questions, drag parts and trays
into the activity's `activity.json`, which the player runs.

On the phone, an installed activity (bundle + `activity.json`) lives under the
app's data folder and opens with no network. Scores made offline are queued and
sent when the network is back.

## Server address

The app talks to `http://192.168.137.1:4000` by default (a Windows laptop's
mobile hotspot running the API). Change it from the sign-in screen's **Server**
tile or **Settings → Server**.

## Credits

Typeface: Montserrat (SIL Open Font License, `Assets/ElimuAR/Fonts/OFL.txt`).
