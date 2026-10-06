# ReWearX

React user client, React admin dashboard, Express/MySQL/Socket.IO backend,
Flask MiniLM NLP search, and Flask six-head EfficientNet-B0 image inference.
This clean export has source, useful tests, dependencies/lock manifests, fresh
schema SQL and exactly one accepted deployable image checkpoint. It has no local
secrets, user database, datasets, installed environments or historical job state.

## Requirements

- Node.js 22+ and npm; Python 3.11 (the locally checked Python version); MySQL 8.
- Network access for npm/Python packages and the initial download of
  `sentence-transformers/all-MiniLM-L6-v2`. The NLP cache is not included.
- Your own MySQL development account/database credentials, two distinct strong
  JWT secrets, Cloudinary credentials for uploads, SMTP credentials for OTP/email,
  and optional Google OAuth credentials/callback configuration.
- Windows PowerShell for the included multi-service launcher. Individual commands
  below can also run separately. Use a supported torch/torchvision pair from the
  requirement manifests appropriate to your OS; CPU inference is supported.

## Install

From the repository root, install each Node application:

```powershell
Push-Location server; npm ci; Pop-Location
Push-Location client; npm ci; Pop-Location
Push-Location admin; npm ci; Pop-Location
py -3.11 -m venv ai-service/.venv
ai-service/.venv/Scripts/python.exe -m pip install --upgrade pip
Push-Location ai-service
.venv/Scripts/python.exe -m pip install -r requirements-image-migration.txt
Pop-Location
```

`requirements-image-migration.txt` includes normal NLP requirements plus
torchvision. `requirements-stage4-lock.txt` is the original environment's reference
snapshot, not a guarantee of cross-platform wheel availability. Optional dataset
collector requirements are separate and are not needed for normal application use.

Copy templates into ignored local files:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item ai-service/.env.example ai-service/.env
Copy-Item client/.env.example client/.env.local
Copy-Item admin/.env.example admin/.env.local
```

Fill credentials locally. Never commit them. Set unique `JWT_SECRET` and
`JWT_REFRESH_SECRET` (at least 32 characters each); the clean backend fails startup
if these remain empty/short/equal. Do not use fixture passwords or test tokens as
real credentials. Set `GOOGLE_CALLBACK_URL` to the backend callback and configure
your provider to allow it; the opaque code-exchange flow requires matching client
origin/redirect configuration. SMTP and Cloudinary are external integrations;
without their credentials, OTP delivery and image uploads are unavailable, not mocked.

## Fresh database only

Use a new local development database. Do not apply the fresh-install script to
an existing database as an upgrade. No database is bundled, and no SQL was executed
when preparing this export.

In a securely authenticated MySQL session, from `server/`:

```sql
SOURCE scripts/migrate.sql;
```

The script selects/creates `rewearx`; match `DB_NAME` accordingly. It contains
schema and a public category catalog, not users/listings/swaps or a database dump.
The clean script includes all 21 currently declared model tables, missing schema
fields, image-prediction JSON columns, embedding state and string color capacity 255.
For an existing independently backed-up database, review/apply only specifically
needed additive migrations: `upgrade_item_features_predictions.sql` is included
and idempotent for its two columns; it is not a complete general upgrade script.
Automatic schema synchronization is disabled in normal startup.

Optional `npm run db:seed` from `server/` seeds category hierarchy idempotently;
it creates no users and deletes no existing catalog. Optional admin creation uses
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (at least 12 characters), and optional
`SEED_ADMIN_NAME` in your local environment, then `npm run create:admin`.
There is no default admin password; the tool refuses to modify an existing account
and does not print the supplied password. Do not pass secrets in committed scripts.

## Run

After configuration and database setup, from the root:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-ReWearX.ps1
```

Ports: client 3000, admin 3001, Node 4000, NLP 5000, image 5001. The launcher is
local-development-only and does not replace processes already using these ports.
If the original project is running, it will retain those ports; do not mistake
its services for this clean copy. No original services were stopped for this export.

Or use five separate terminals:

```text
client/:       npm run dev
admin/:        npm run dev
server/:       npm start
ai-service/:   .venv/Scripts/python.exe -B app.py
ai-service/:   .venv/Scripts/python.exe -B -m feature_extraction.app
```

On Unix use `.venv/bin/python` and set local environment variables accordingly.
The convenience learning-worker Python default is Windows-specific; opt-in learning
on Unix must set `IMAGE_TRAIN_PYTHON` to your virtual environment interpreter.
Frontend development API URLs are in the templates; production deployments need
their own HTTPS API/proxy/CORS/Socket.IO origin configuration.

## Included image model

`ai-service/feature_extraction/checkpoints/phase3_stage_a_best.pt`

- Bytes: 16,608,947 (15.84 MiB, 16.61 MB decimal), below GitHub's 100 MiB per-file limit.
- SHA-256: `b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a`.
- Exact accepted bytes, unchanged. The nearby `manifest.json` records hash/size.
- Six heads: color, occasion, season, category, sleeve_length, pattern.
- Unsupported inference labels remain masked: skirt, half sleeves, all_season.
- Phase 1/Phase 2 checkpoints and previous candidates are not needed for normal
  inference and are not included. The image model is fully loaded from this checkpoint;
  it does not need to download ImageNet weights at inference time.

Run the image service from `ai-service/` so the template's relative checkpoint
path resolves correctly. Flask will remain not-ready for a missing/incompatible
checkpoint; it does not substitute an untrained model.

## Continual learning and historical training

Continual-learning source, masks, worker, registry and rollback logic are included.
Automatic learning and registry watching default OFF in this export. Normal listings,
search and image inference do not require replay datasets or training history.

No approved replay manifest/images, Phase 1/Phase 2 datasets, Phase 3 training bundle,
holdouts, collected Cloudinary training images or previous learned model candidates
are bundled. Historical training/collector/review code is retained for development;
running those tools requires separately obtained datasets and optional dependencies.

The worker's clean base path uses the included checkpoint. Opt-in settings:
`IMAGE_LEARNING_ENABLED=true`, `IMAGE_BASE_CHECKPOINT_PATH` (optional absolute override),
`IMAGE_TRAIN_PYTHON`, `IMAGE_TRAIN_REPLAY_MANIFEST`, `IMAGE_TRAIN_DATASET_ROOT`, and
`IMAGE_TRAIN_REPLAY_LIMIT`. With absent replay files, the trainer currently skips
replay; default template limit 0 makes this explicit. Do not claim regression
protection or full retraining reproducibility without suitable replay/holdout data.
Configure and validate consent, data rights, labels and regression checks before
enabling learning. Generated `runtime/learning` states/candidates stay Git-ignored.
No training was performed for this export.

## Checks

```powershell
Push-Location server
$tests = @(Get-ChildItem tests -Filter '*.test.js' | ForEach-Object {$_.FullName})
node --test @tests
Pop-Location
Push-Location client; node --test tests/*.cjs; npm run lint; npm run build; Pop-Location
Push-Location admin; npm run lint; npm run build; Pop-Location
Push-Location ai-service
.venv/Scripts/python.exe -B -m unittest discover -s tests -v
Pop-Location
```

Use PowerShell file enumeration for wildcard Node tests if your Node/shell does
not expand wildcards. Optional historical real-Phase-2 comparison tests remain
skipped when their intentionally excluded source checkpoint is absent. Synthetic
fixtures contain fake test tokens/passwords, not credentials for working accounts.
Review `GITHUB_EXPORT_REPORT.md` for the checks actually performed, their limitations,
copy-only portability changes and security audit. No remote repository was initialized
or pushed. Training licenses/data rights and deployment configuration remain your
responsibility; do not present this export as live provider/end-to-end certification.
