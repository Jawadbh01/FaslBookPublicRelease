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
