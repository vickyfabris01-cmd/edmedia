# EdMedia

A mobile-first, offline-capable image editor with reusable templates. Vanilla JavaScript, no build step.

## Run it

From this folder:

    npx serve .

Open the address it prints. On a phone, use the browser menu to install it to the home screen.
If you see stale files after an update, clear site data for the address once (the service worker caches files).

## What is inside

- Editor: crop, rotate, flip, straighten, zoom, adjust (16 sliders), 10 filter looks (plus saved looks),
  vignette (strength, amount, softness, roundness, position, light edges), mask (apply edits inside or outside
  a shape), blur, selective black and white (smart edge-snapping brush, brush, select person, rectangle, ellipse),
  text, watermark (text, logo, repeating), shapes, layers, resize, undo and redo, hold-to-compare.
- Templates: 9 built-in templates plus your own. Using a template lets you drag and zoom your photo
  into place first, then the template takes over. A template is never changed by a session.
  "Save as template" is always in the editor menu. Template names are checked live and duplicates are blocked.
- Export: JPEG, PNG, WebP, quality, size and social presets, live preview and file size, download and share.
- Projects autosave on the device. Photos stay on the device.
- Profile: theme (device, light, dark), export defaults, brand library (your logos), storage, cloud sync.

## Select person (optional files)

The Selective B&W tool can find people in a photo automatically. It runs on the phone, nothing is uploaded.
Its files (about 6 MB, from the `@mediapipe/selfie_segmentation` package) are not stored in the repo:

    node tools/fetch-segmenter.mjs

This puts them in `assets/vendor/selfie_segmentation/`. Deploy that folder with the app. They are saved on the
device the first time someone uses Select person, then work offline. They are never part of the install cache
(`gen-precache.mjs` skips any folder named `vendor`). If the folder is missing, the app loads them from the
internet instead. The smart brush, brush and shapes need no extra files.

## Cloud sync (Supabase)

Sync is optional. Until it is set up, the app works fully offline and the sign-in screen says so.

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor. It creates one table with row level security.
3. Open `js/config.js` and paste the project URL and the publishable (anon) key.
4. In Supabase, Authentication, URL Configuration: add the address where the app is hosted to the
   redirect URLs (needed for confirmation and password reset emails).
5. Run `node tools/gen-precache.mjs` so the new config file is cached offline.

What syncs: templates, brand logos, saved looks, and settings. Newest edit wins.
Projects and their photos stay on the device.

## Project layout

    index.html, manifest.json, sw.js, precache.js
    css/            tokens (colors, spacing, type), layout, base
    js/main.js      start-up       js/router.js   hash router
    js/engine/      recipe, render, pixel effects, filters, history, gestures
    js/editor/      stage, export sheet, tool panels
    js/screens/     home, projects, profile, brand, auth, slot, editor
    js/components/  reusable UI (styles live inside each component)
    js/store/       IndexedDB stores
    js/sync/        Supabase sign-in and sync
    js/data/        built-in templates
    supabase/       database schema
    tools/          gen-precache.mjs, fetch-segmenter.mjs
    assets/vendor/  optional person-detector files (made by fetch-segmenter.mjs)

Conventions: component files are PascalCase.js, everything else is lowercase. No emojis, filled SVG icons only
(`js/icons.js`). Colors, spacing and type come from `css/tokens.css`.

## Developing

- After adding or renaming files, run `node tools/gen-precache.mjs`.
- On localhost the on-screen console shows errors (tap the red badge). "Check files" scans every import
  and reports missing files, wrong filename case, and missing exports. Add `?debug=1` to use it elsewhere.