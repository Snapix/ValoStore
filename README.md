# ValoStore

ValoStore is a lightweight software catalogue for discovering upstream Linux and Android applications without hosting the applications themselves.

## Live catalogue sources

- **F-Droid** — Android application metadata from the signed repository index.
- **Flathub** — Linux application metadata from the combined AppStream catalogue.

The sync imports names, summaries, descriptions, categories, licences, developers, package IDs, versions, release notes, icons, screenshots, project links, and install information where the upstream catalogue provides it.

ValoStore does **not** mirror APKs, Flatpaks, runtimes, installers, or application source repositories.

## Sync architecture

```
F-Droid index-v2.json ─┐
                       ├─> scripts/sync_catalog.py ─> data/catalog.json ─> Vercel
Flathub AppStream ─────┘
```

GitHub Actions runs the sync on a schedule and can also be started manually. The generated catalogue is committed atomically; a failed or unexpectedly small sync exits without replacing the existing catalogue.

## Local development

No build step is required:

```bash
npx serve .
```

To regenerate the catalogue locally:

```bash
python3 scripts/sync_catalog.py
```

## Trust model

Upstream metadata is displayed as upstream metadata. ValoStore does not claim that an imported application has been manually security-reviewed.

Package IDs are preserved from the source catalogue. Linux Flatpak commands are generated from validated Flathub application IDs; Android entries link to their F-Droid package page instead of inventing a shell installation command.

## Current scope

The first live importer covers **F-Droid + Flathub**. Windows/WinGet is intentionally a separate adapter so one source cannot silently become the authority for another platform.
