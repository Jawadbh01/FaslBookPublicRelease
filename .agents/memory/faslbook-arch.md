---
name: FaslBook architecture decisions
description: Key decisions for FaslBook farm OS — auth model, data model, color palette
---

## Auth model
- Only "landlord" and "manager" roles can log in
- "farmer" role users are rejected at AuthProvider level → redirected to /login?farmer=1
- Farmers are manual records in `workers` collection with workerType:"farmer"
- Role-select only shows landlord + manager (farmer removed)

## Color palette
- Green: #1B5E20 (landlord/farmer branding)
- Blue: #1565C0 (worker/manager branding)
- Red: #C62828
- Orange: #E65100

## Data model
- `workers` collection: both farmers (workerType:"farmer") and workers (workerType:"daily"|"monthly")
- `attendance` collection: {workerId, date (YYYY-MM-DD), status, organizationId}
- `organizations` collection: farm data
- `users` collection: authenticated users (landlord, manager only in practice)

## Offline mode
- SyncIndicator detects offline + no localStorage cache → shows download prompt card
- /offline route: full-screen offline page with Try Again + Download Data buttons
- Cache keys: faslbook_user_cache, faslbook_org_cache

## Firebase Storage
- Upload code is correct in uploadPhoto.ts
- If storage/unauthorized: user must set Firebase Console rules: allow read, write: if request.auth != null;

**Why:** These are non-obvious decisions about who can log in vs. who is a data record — easy to get wrong if not documented.

## Ignore duplicate/orphaned workflows
`.migration-backup/artifacts/*` and the standalone `FaslBook` workflow are stale duplicates (missing node_modules, port conflicts) and will always show failed — that's expected. Only `artifacts/faslbook: web` is the real active app; check that one when verifying whether the app works.

## Firestore sync/offline status can hang indefinitely without timeouts
`navigator.onLine === true` does not guarantee real connectivity (captive portals, flaky networks). Firestore calls like `waitForPendingWrites()` and `getDocs()` have no built-in timeout, so any UI state driven by `await`-ing them (e.g. a "syncing"/"downloading" spinner) can get stuck forever if the network is degraded but reports as online.

**Why:** This caused a real "offline mode stuck loading" bug — the download/sync flow assumed these calls would always resolve or reject promptly.

**How to apply:** Wrap any user-facing Firestore operation that gates a loading/syncing UI state in a `Promise.race` with an explicit timeout (~15s), and make sure the timeout path resets the UI state back to a sane value (`online`/`offline`) rather than leaving it stuck.
