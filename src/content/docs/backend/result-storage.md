---
title: Result Storage
description: How result pages are kept in an S3 bucket as Zarr arrays, and read by the browser with signed links.
---

Result pages are not kept in PostgreSQL. Each page is a **Zarr v3 array** in an S3 bucket, the `garage` service of
`docker-compose.yml` on a deployment. The database keeps only the page's name, dimension and where it is stored. The
browser fetches the pages straight from the bucket with **signed links**, so result data passes neither through
PostgreSQL nor through Flask.

| Code | Role |
|---|---|
| `yaptide/persistence/result_storage.py` | S3 client, keys, put, read, delete, signed links |
| `yaptide/batch/result_format.py` | Zarr v3 writer and reader for one page (standard library only, numpy and zstandard when present) |
| `PageObjectModel` in `yaptide/persistence/models.py` | Where a page is: key, size, format |
| `page_content`, `store_results` in `yaptide/routes/common_sim_routes.py` | `GET /results` and `POST /results` |
| `nginx.conf`, `/yaptide-results/` | The browser's way to the bucket |
| `yaptide/admin/db_manage.py` | Moving pages stored before the bucket, and back |

## Configuration

A bucket is required: Flask does not start without these settings (`docker-compose.yml` sets them from `.env`).

| Variable | Description |
|---|---|
| `RESULTS_S3_BUCKET` | Bucket name, `yaptide-results` in compose |
| `RESULTS_S3_ENDPOINT` | Where Flask reaches the bucket, `http://garage:3900` in compose |
| `RESULTS_S3_ACCESS_KEY`, `RESULTS_S3_SECRET_KEY` | Keys of the bucket |
| `RESULTS_S3_PUBLIC_ENDPOINT` | Optional: address the browser's links are signed for; default `BACKEND_EXTERNAL_URL` |
| `RESULTS_S3_REGION` | Optional: region the requests are signed for; default `garage` |

On a deployment, Garage creates the bucket and the key on its first start from `RESULTS_S3_ACCESS_KEY`,
`RESULTS_S3_SECRET_KEY` and `GARAGE_RPC_SECRET`, see [Docker Deployment](/for_developers/backend/docker-deployment/#result-storage).

## Storage Layout

```
simulations/<simulation id>/<estimator file name>/<page number>/<revision>/zarr.json
simulations/<simulation id>/<estimator file name>/<page number>/<revision>/c/0
```

- `zarr.json` — the array's metadata. Its `attributes.yaptide_page` holds the page as the JSON pages had it (name,
  unit, axes, metadata), without the values.
- `c/0` — one shard holding every chunk of the values, as float32 in the order pymchelper keeps them (flat). A
  page of dimension 0 has one value; a page without values has no shard.

Chunks hold 65 536 values (256 KiB) and are compressed with zstd (level 1). Where zstandard is missing the writer
falls back to gzip (level 1), which any Zarr reader also opens. Chunks of zeros only are left out of the shard (its
index marks them empty), so sparse results take little space. Any Zarr v3 reader opens a page; the UI reads them as
described in [Results Loading](/for_developers/frontend/results-loading/).

### Revisions

Every time a page is stored, it gets a new **revision**, a random 16-hex-digit name, so its objects go under a new
prefix. The database points the page at the new prefix only once all its objects are in the bucket, in the same
commit as the estimators. A reader therefore always gets either the old page or the new one, never a page half
written, and the old prefix is removed only after the commit.

## Writing Results

The merge of a direct simulation and the collect job of a batch simulation send the merged results, values
included, to `POST /results`. For each page, `store_results`:

1. waits for other results of the same simulation being stored (a PostgreSQL advisory lock), so two requests do not
   both create the estimators;
2. converts the page to Zarr (`result_format.page_files`) and puts its objects under a new revision; each upload
   carries its `Content-MD5`, so the bucket refuses a body that arrived changed;
3. points the page's `PageObject` row at the new prefix and empties `Page.compressed_data`;
4. commits the estimators and pages together, then removes the prefixes of the pages they replaced.

If the bucket fails on any page, nothing of these results is kept: the transaction is rolled back, the objects
already put are removed, and the request answers `500`. The simulation stays in its state.

## Reading Results

`GET /results` answers each stored page with its `page_number`, `name`, `dimensions`, `format` (`zarr-v3`), and
a signed link for each object in `files` (`url` is the link of `zarr.json`). See the
[Results API](/for_developers/api-reference/results/).

- **Links last 15 minutes** (`URL_SECONDS`). The UI fetches a page right after asking for it; a link that leaks stops
  working soon after, and a client that needs a page later asks `/results` again.
- **Links are signed for `BACKEND_EXTERNAL_URL`** (or `RESULTS_S3_PUBLIC_ENDPOINT`), at the path
  `/<bucket>/<key>`. Nginx passes `/yaptide-results/` to Garage with the `Host` header and the path unchanged, since
  the signature covers both. That route allows only `GET` (and `HEAD`), answers a browser's preflight (`OPTIONS`) itself, and adds the CORS
  headers.
- **The bucket allows no anonymous access.** Garage publishes no port; only Flask, inside the compose network,
  holds the keys. A request through nginx without a valid signature, or with another method, is refused (`403`).

A page stored before the bucket and not moved there yet still has its data in `Page.compressed_data` and goes to the
UI as the page itself, as before.

## Deleting

Deleting a simulation (`DELETE /user/simulations`) removes it from the database first, then every object under
`simulations/<id>/` in the request, listed and deleted 500 keys per request with a patient client (2 minutes per
request, 5 attempts). A failure is logged and leaves objects no page points at; the simulation is gone either way.
`db_manage remove-simulation` removes the objects too.

## Pages Stored Before the Bucket

Pages stored before this storage keep their gzip-compressed JSON in `Page.compressed_data`. Three `db_manage`
commands, run in the `yaptide_flask` container, move them; all take `--dry-run` and `--batch-size`:

```bash
docker exec yaptide_flask python -m yaptide.admin.db_manage copy-pages-to-storage
docker exec yaptide_flask python -m yaptide.admin.db_manage clear-pages-in-postgres --dry-run
docker exec yaptide_flask python -m yaptide.admin.db_manage clear-pages-in-postgres
```

1. **Back up first**: `scripts/backup.sh`, or at least a `pg_dump --format=custom`.
2. **`copy-pages-to-storage`** converts each page of a finished simulation (completed, failed or canceled) to Zarr,
   as new pages are stored, uploads it and checks every object in the bucket (size and MD5). It only reads the
   database: the pages are still served from it. The revision of a copy is taken from the page's id and its Zarr
   objects, so a repeated run finds the copies already made and uploads only what is missing, also after
   `move-pages-to-postgres`; it can be stopped and repeated at any time. Pages of running simulations are left to the backend, which may replace them; run again after they end.
3. **`clear-pages-in-postgres --dry-run`** lists any page without a matching copy.
4. **`clear-pages-in-postgres`** makes the copies the only ones: for each batch whose every page is verified in the
   bucket, in one transaction, it empties `compressed_data` and adds the `PageObject` row. A page the backend
   stored again meanwhile is left alone. From then on the pages are read from the bucket.

**Back:** `move-pages-to-postgres` reads every page kept in the bucket, converts it back to JSON (the values keep
float32 precision) and writes it into `Page.compressed_data`, removing its `PageObject` row; the objects stay in the
bucket. Run it before downgrading below migration `9e2b41c7d5a3`, which refuses while `PageObject` has rows, since
they are the only record of those pages.

## Backups

`scripts/backup.sh`, run nightly on the host, sends a `pg_dump` and a mirror of `simulations/` to a second S3 server,
keeping objects removed or replaced in the bucket aside for 14 days; `scripts/backup.sh restore DATE` puts a dump and
the missing pages back. Its settings and the restore procedure are in the backend's `README.md`. Keep a copy of
`.env` elsewhere: a restored Garage needs the same keys.
