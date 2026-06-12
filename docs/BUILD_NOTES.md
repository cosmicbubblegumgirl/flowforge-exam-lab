# Build notes

## Architecture

FlowForge is a dependency-free static PWA designed for GitHub Pages.

- `index.html`: authentication and application shell
- `styles.css`: responsive SAP-inspired visual system
- `js/app.js`: routing, exam runtime, game mechanics, and system lab
- `js/db.js`: IndexedDB access and PBKDF2 credential hashing
- `js/questions.js`: 59 system and 59 scenario questions
- `service-worker.js`: production offline cache

## Authentication and database

GitHub Pages cannot execute a server or protect a shared database. The current implementation is therefore device-local:

- passwords are never stored directly
- each password gets a random 16-byte salt
- PBKDF2-SHA-256 uses 120,000 iterations
- attempts, bookmarks, and profiles are stored in IndexedDB

For multi-device accounts, replace `js/db.js` with SAP BTP CAP/HANA Cloud and SAP Cloud Identity Services or XSUAA.

## Exam behavior

- Full simulations: 59 questions
- Quick formats: 10 or 20 questions
- Mixed format: balanced 30 system and 29 scenario questions
- Random question order and optional answer-order randomization
- Timed and untimed sessions
- Automatic local save and resume
- Flags, navigator, unanswered review, grading, rationales, and bookmarks
- Domain analytics, readiness, XP, and ranks

## Branding

The logo and icon are original FlowForge assets. The interface is inspired by enterprise SAP design conventions but does not use an SAP logo and does not claim to be an official SAP product.

Created by **quantumcupcakecreation**.
