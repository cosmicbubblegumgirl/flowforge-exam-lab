# FlowForge Exam Lab

FlowForge is an independent SAP Integration Suite practice simulator created by **quantumcupcakecreation**.

It provides:

- 59 original system-based questions
- 59 original scenario-based questions
- Full, quick, and mixed randomized exam modes
- Timers, autosave, resume, flags, question navigation, and answer review
- Domain-level readiness analytics, XP, ranks, history, and bookmarks
- A simulated Integration Suite workspace for monitoring, design, API, and security practice
- Local user registration and login with PBKDF2 password hashing
- IndexedDB persistence for users, attempts, results, and bookmarks
- PWA installation and offline caching
- A GitHub Pages deployment workflow

## Important deployment note

GitHub Pages is a static host. FlowForge therefore uses a private browser-local IndexedDB database. Accounts and progress are available only in the browser profile where they were created.

For shared, server-side identity and data, replace `js/db.js` with a hosted backend such as SAP BTP CAP with HANA Cloud and SAP Cloud Identity Services/XSUAA.

## Demo login

```text
Username: architect
Password: Forge123!
```

The demo user is created locally on first load.

## Run locally

Serve the project directory over HTTP:

```powershell
python -m http.server 4188
```

Then open `http://localhost:4188`.

Opening `index.html` directly with `file://` is not supported because the app uses JavaScript modules, IndexedDB, and a service worker.

## Deploy

The workflow at `.github/workflows/deploy-pages.yml` publishes the repository root to GitHub Pages whenever `main` is updated.

The repository Pages source must be set to **GitHub Actions**.

## Content policy

All practice questions are original and are not copied certification questions. FlowForge is not affiliated with or endorsed by SAP SE. SAP and SAP Integration Suite are trademarks of SAP SE.
