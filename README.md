# ElimuAR

AR science activities for Tanzanian secondary schools: an Android app (Unity + ARCore) where learners observe, explore and answer questions about 3D models anchored on their desk, and a web portal where schools manage classes, subjects, teachers and learners and see real reports.

## Parts

| Folder | What it is |
| --- | --- |
| `apps/mobile` | The phone app (Unity 6000.6.2f1, AR Foundation/ARCore) |
| `apps/web` | The web portal (Next.js 14), port 3000 |
| `apps/api` | The API (Node.js + Express + Drizzle), port 4000, and the MySQL schema |
| `packages/shared` | Validation rules and types shared by the web and the API (Zod) |

## Run it

```bash
npm install
cp .env.example apps/api/.env          # then fill in the secrets (from the team)
echo API_ORIGIN=http://localhost:4000 > apps/web/.env.local
npm run db:local:start                 # or: npm run db:up (Docker)
npm run db:migrate && npm run db:seed && npm run db:seed:ar-activities
npm run dev:api                        # terminal 1
npm run dev:web                        # terminal 2 → http://localhost:3000
```

Build the app: `npm run mobile:build` → `apps/mobile/Builds/ElimuAR.apk`.

## Practical files

The four practical bundles and their thumbnails are in [`content/ar-activities`](content/ar-activities), laid out exactly as in the Cloudflare R2 bucket.

| Practical | Subject | Bundle |
| --- | --- | --- |
| Setting Up a Computer | Computer Science, Form 1 | `settingupacomputer_android_v002.bundle` |
| Respiratory System | Biology, Form 2 | `respiratorysystem_android_v027.bundle` |
| Circulatory System | Biology, Form 3 | `22_science_circulatory_android_v029.bundle` |
| Human Eye | Biology, Form 3 | `humaneye_android_v023.bundle` |

`.env.example` carries the R2 bucket settings, so `npm run db:seed:ar-activities` registers all four and the API serves them from the bucket. To run without Cloudflare, empty the `R2_*` and `S3_ENDPOINT` lines in `apps/api/.env` and copy the files to the API's local store:

```bash
mkdir -p apps/api/storage/models && cp -r content/ar-activities apps/api/storage/models/
```

## Credits

The practical bundles and the software ElimuAR builds on are listed in [`CREDITS.md`](CREDITS.md).
