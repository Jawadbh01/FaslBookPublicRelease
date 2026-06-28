# FaslBook V2 — Deployment Guide

## Step 1 — Add your images
Replace these in /public folder:
- logo.png (512x512) — your farm logo
- icon-192.png (192x192) — app icon small
- icon-512.png (512x512) — app icon large
- banner.png — login screen image

## Step 2 — Firebase Console Setup
1. Authentication → Sign-in method → Enable Google + Email
2. Authentication → Settings → Authorized domains → Add your Vercel URL
3. Firestore → Rules → Paste contents of firestore.rules
4. Storage → Rules → Add:
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
5. Cloud Messaging → Web Push → Generate VAPID key → Copy it

## Step 3 — Deploy to Vercel
1. Go to vercel.com → New Project → Import from GitHub
2. Add Environment Variables:
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=
3. Click Deploy

## Step 4 — After Deploy
1. Copy your Vercel URL (e.g. faslbook.vercel.app)
2. Firebase Console → Authentication → Authorized Domains → Add Vercel URL
3. Google Cloud Console → APIs & Services → Credentials → Add Vercel URL to OAuth redirect URIs:
   https://faslbook.vercel.app/__/auth/handler

## Step 5 — Test PWA Install
1. Open app on mobile Chrome
2. Tap browser menu → "Add to Home Screen"
3. App installs as native-like PWA
4. Works fully offline after first load
