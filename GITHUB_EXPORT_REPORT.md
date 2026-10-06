# GitHub Export Report

Prepared 2026-10-07. No remote was created or pushed; the clean folder has no Git history.

## Location and scope

Clean folder: `C:\Users\Mirza Saad\Downloads\Rewearx-Latest\ReWearX-GitHub-Clean`

Original: `C:\Users\Mirza Saad\Downloads\Rewearx-Latest\Final_Year_Project-release-v1-0`

Included folders: `client/`, `admin/`, `server/`, `ai-service/`. Root files include the launcher, `.gitignore`, setup README and this report. This is approximately 26 MB of source/assets plus one accepted checkpoint, not a copy of installed environments or datasets.

Included: React components and required static assets; Express routes/controllers/services/models/sockets/workers; image inference and Flask NLP; continual-learning and reusable training/collector/review code; regression tests; three npm manifests/lock files; Python requirements/reference lock files; category configuration; blank environment templates; fresh-install schema SQL and additive image-prediction SQL.

Excluded: actual environment files and secrets; node_modules/virtual environments; raw/collected/replay datasets and images; Phase 1/2 checkpoints and candidate checkpoints; ZIP training bundles; SQL dumps/backups/user records; runtime learning jobs; caches/logs/build output; viva files; stage reports/migration audits/screenshots/evaluation artifacts; old projects and backups. The historical training code does not imply its external datasets are bundled.

## Runtime checkpoint

Only `ai-service/feature_extraction/checkpoints/phase3_stage_a_best.pt` is included.

| File | Bytes | Size | SHA-256 |
|---|---:|---|---|
| `phase3_stage_a_best.pt` | 16,608,947 | 16.61 MB / 15.84 MiB | `b2911bd9d1ed6e737c3e2a4695518d48eb829fd2489fa224fa4b317340af785a` |

This is the **complete list of files above 10 MB**. It is below the normal GitHub 100 MiB per-file limit. A small adjacent manifest records size/hash. The actual copied checkpoint loads successfully through the inference service with all six heads. Phase 1/2 files are not required for normal inference. Unsupported outputs remain masked: skirt, half sleeves and all_season. No checkpoint was edited or retrained.

## Security and data audit

- No real `.env` files: only four newly generated `.env.example` templates.
- No matches against known credential values from the original environment files, including the copied checkpoint bytes/metadata.
- Scanned source/config/document files for password/token/secret literals, private keys, JWT literals, credential URLs and personal email addresses. Eleven matches were inspected as synthetic isolated-test fixtures, not usable application credentials. No real credential finding remains.
- No database dump, user/listing/message SQL insert, downloaded user image collection or production data export is included. The schema script contains only schema definitions and public category catalog seed values.
- No node_modules junctions, venvs, datasets, runtime jobs, generated logs or cache folders remain. Temporary dependency links used for verification were removed.
- `.gitignore` rules were checked: secrets/dependencies/datasets/artifacts are excluded, while the two intentional migration scripts, environment templates and single runtime checkpoint remain includable.
- All 363 original files recorded for preservation, including original local environment files and the accepted checkpoint, still match their pre-export SHA-256 hashes. No writes were made to the original project, database or its services.

This is a local static security/data audit, not a guarantee that arbitrary future configuration or newly generated files are safe to publish. Inspect the staged diff before the eventual first commit/push.

## Export-only setup corrections

These changes exist only in this separate folder:

1. Generated safe environment templates, setup documentation and targeted ignore rules. Removed hardcoded personal contact/default seed credential values from copied text.
2. Pointed image inference and the learning worker at the included checkpoint. Made learning and checkpoint watching opt-in; added explicit replay path overrides and documented absent replay data. Normal inference does not require replay datasets.
3. Made the NLP cache project-relative and fixed the client Vite alias for ESM portability. Added small fallback placeholder/avatar assets and removed unused image assets.
4. Removed public JWT fallback secrets; backend startup requires two distinct secrets of at least 32 characters.
5. Made category seeding idempotent/category-only and admin creation environment-driven with no default password, schema synchronization or existing-account overwrite.
6. Reconciled the clean fresh-install SQL with 21 declared Sequelize tables and required current fields, including image prediction JSON. No SQL was executed. This script is for a new database, not a general existing-database migration.
7. Replaced the image integration test's dependency on an excluded audit report with a small source-hash fixture. Historical real-Phase-2 comparison tests remain optional/skipped when the excluded baseline checkpoint is absent.

## Validation actually performed

| Check | Result |
|---|---|
| Backend isolated regression tests | **203/203 passed** |
| Client isolated regression tests | **67/67 passed** |
| Client TypeScript check | **Passed** |
| Admin TypeScript check | **Passed** |
| Client production build | **Passed** |
| Admin production build | **Passed** |
| Python source syntax/compile checks | **85 files passed** |
| Internal Python source import closure | **No missing internal modules found** |
| npm manifest vs lock root dependencies | **All three consistent** |
| Actual exported six-head checkpoint loading | **Passed; hash unchanged** |
| Fresh schema/model reconciliation | **Static check passed for 21 tables; not executed** |
| Original-file preservation | **363/363 hashes unchanged** |

Checks reused existing installed dependencies read-only; they were not copied into this export. Vite validation used the runner config loader and output outside the clean folder. Both builds retain the existing large-JavaScript-chunk warning (>500 kB), not a build failure. No fresh package installation, live MySQL setup, provider authentication or clean-copy browser end-to-end run was claimed. Isolated tests are not live workflow verification.

## Fresh-clone readiness and separate requirements

**Core application source and normal image inference are ready for installation/configuration.** Follow `README.md` for npm/Python installation, fresh development MySQL schema, templates and five service startup commands. Configure unique JWT secrets, local database credentials, Cloudinary, SMTP and optional Google OAuth locally. The NLP service needs the initial MiniLM model download; its cache is excluded. OS-compatible torch/torchvision wheels must be installed. The included reference Python lock is not a cross-platform wheel guarantee.

No original users or listings are provided. Use your own disposable development records and configured external services. Email/Cloudinary/OAuth functionality is not available without those credentials; no mocks substitute for them.

Continual-learning source is included but automatic learning is OFF. Approved replay datasets/holdouts and original Phase 1/2/3 training data are intentionally absent. Obtain/configure them separately and validate consent and regression protection before enabling training. Replay-free technical retraining must not be presented as preserving historical performance. No training was run here.

No Git remote was initialized, no push occurred, no database was changed, and the original project was preserved.
