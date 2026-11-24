# KRUTr Calculator Pro — Stage 1 UI Foundation

This is the first development-stage deliverable: the responsive dashboard shell and visual interface.

## Included
- Responsive three-calculator dashboard layout
- Maximum Pay, Bill Rate and Margin card structures
- Client presets and calculation-history sections
- Dark-first theme with a working light/dark toggle
- Markup / desired-profit selector interaction
- Separate HTML, CSS and JavaScript files
- Accessible labels, button states and reduced-motion support

## Not yet implemented
- Financial calculation engine and live previews
- Calculate / Reset actions
- Preset creation, JSON import/export and persistence
- Calculation history and CSV export
- IndexedDB storage

These are intentionally deferred to subsequent development stages. Buttons without an implemented Stage 1 action are UI placeholders, not completed functionality.

## Run locally
Open `index.html` in a modern browser. No build tools, server, dependencies or API keys are required.


## Stage 2 — Shared financial engine

Implemented `js/calculations/pricing-engine.js` with:
- Common deduction and loaded-cost model
- Maximum Pay Rate calculator
- Bill Rate calculator
- Margin Analysis calculator
- Input validation and explicit validation errors
- Theoretical and practical cent-rounded rates
- USD and percentage formatters

See `docs/financial-engine-specification.md` for the approved formulas.

### Automated tests
Run with Node.js 18+:
```bash
node --test tests/pricing-engine.test.js
```

Stage 2 does not yet connect the engine to dashboard controls. That is the next integration task.


## Stage 3 — Functional calculator integration

Implemented:
- Live preview as calculator inputs change
- Working Calculate and Reset controls
- Markup / Desired Profit switching
- Desired-profit numeric input and synchronized $0–$500 slider
- Detailed revenue and cost breakdowns
- Profitability states: profitable, loss and break-even
- Field-level validation messaging through accessible alert regions
- Copy calculation summaries
- Independent calculator card state
- Responsive result panels

### Run tests
```bash
node --test tests/*.test.js
```

### Run locally
Open `index.html` in a modern browser. Keep the `css`, `js`, `tests` and `docs` folders alongside it.

Stage 4 adds durable calculation history and reusable client presets.


## Stage 4 — Presets and persistent history

Implemented:
- IndexedDB database with `presets` and `calculations` object stores.
- Automatic localStorage fallback when IndexedDB is unavailable or blocked.
- Create, edit, delete and reuse named client presets.
- Apply a preset to Maximum Pay, Bill Rate, Margin Analysis, or all three calculators.
- Versioned JSON preset export and validated JSON import.
- Calculate now saves a calculation snapshot to persistent history; live previews do not.
- Reopen a saved calculation into its original calculator, recalculate it, and copy its summary.
- Delete individual history items, clear all history after confirmation, and export CSV.
- Responsive preset/history record lists and an accessible native dialog.

### Storage notes
Data is stored locally in the current browser profile on the current device. It is not synced to an account or shared between browsers. Clearing browser site data can remove locally stored records; use JSON/CSV exports for portable backups. IndexedDB is the primary store; localStorage is a compatibility fallback.

### Stage 4 checks
Run:
```bash
node --check js/storage.js
node --check js/stage4.js
node --test tests/*.test.js
```


## Deploy free on Vercel

KRUTr is a static HTML/CSS/JavaScript app. It does not need a build command or server-side functions.

### Recommended: GitHub-connected deployment

1. Create a new **public or private personal GitHub repository** named `krutr-calculator-pro`.
2. Upload the contents of this project folder to the repository root. Make sure `index.html`, `css/` and `js/` are at the root level (not nested inside another project folder).
3. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
4. Import the `krutr-calculator-pro` GitHub repository and authorize access if prompted.
5. In project configuration, choose **Other** as the Framework Preset. Leave Build Command and Install Command empty. Set Output Directory to `.` if Vercel asks for one.
6. Select **Deploy**. Vercel will provide a `*.vercel.app` URL.
7. Future commits pushed to the connected production branch (normally `main`) will trigger deployments automatically.

### Important storage note

Presets and calculation history are stored in the visitor's browser using IndexedDB, with localStorage as a fallback. They are not stored in Vercel and will not sync across devices or browsers. Ask users to export their presets/history if they need backups.

### Optional CLI deployment

From this project folder, install the Vercel CLI and deploy:

```bash
npm install --global vercel
vercel
vercel --prod
```

The first command creates a preview deployment and links the local folder to a Vercel project; the second creates a production deployment.
