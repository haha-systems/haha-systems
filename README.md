# Haha Systems

A markdown-first Eleventy site: notes, writings, documents, projects, and
Arachne.

## Quick start

```sh
nvm use            # optional, picks Node 20 from .nvmrc
bun install
bun run serve      # http://localhost:8080
bun run build      # compiles Tailwind, then writes _site/
```

Output is plain static HTML/CSS — Tailwind is build-time only.

## Layout

```
src/
  _data/site.js              site metadata, section list
  _includes/
    layouts/                 base, page, entry, section
    partials/                header, footer, mark (inline SVG)
  styles/main.css            Tailwind source stylesheet
  assets/css/main.css        generated stylesheet
  notes/                     section: notes/*.md
  writings/                  section: writings/*.md
  documents/                 section: documents/*.md
  projects/                  section: projects/*.md
  arachne/                   section: arachne/*.md
  index.njk                  home
.eleventy.js                 collections, filters, passthrough
```

Each section directory contains:

- A `<section>.json` directory data file that sets the layout,
  permalink, and section tag for every Markdown file inside.
- An `index.njk` that uses `layouts/section.njk` to list the entries.
- One Markdown file per entry, named `YYYY-MM-DD-slug.md`.

## Authoring an entry

```markdown
---
title: A short, true title
date: 2025-05-04
summary: One sentence shown on the section index and home.
---

The body of the entry, in Markdown.
```

See `/documents/authoring-conventions/` once the site is running for
the canonical version of these rules.

## Adding a new section

1. Create `src/<section>/`.
2. Add `src/<section>/<section>.json`:
   ```json
   {
     "layout": "layouts/entry.njk",
     "section": "<section>",
     "permalink": "/<section>/{{ page.fileSlug }}/",
     "tags": ["<section>"]
   }
   ```
3. Add `src/<section>/index.njk` with frontmatter setting
   `layout: layouts/section.njk`, `section: <section>`, `permalink:
   /<section>/`.
4. Register in `src/_data/site.js` `sections` array.
5. Add a collection in `.eleventy.js`.

## Deployment

The site builds to a static `_site/` directory. Any static host works.

### Netlify

`netlify.toml` is included. Connect the repo, accept defaults; Netlify
will run `bun run build` and publish `_site/`.

### Vercel

`vercel.json` is included. Import the repo; Vercel reads the build
command and output directory from the config file.

### GitHub Pages, Cloudflare Pages, S3, etc.

Run `bun run build` in CI and upload the contents of `_site/` to the
host. Set `SITE_URL` at build time so the Atom feed and Open Graph tags
contain absolute URLs:

```sh
SITE_URL=https://example.org bun run build
```

### Local-only preview

`bun run serve` runs Eleventy's dev server on
[http://localhost:8080](http://localhost:8080).

## Conventions

- Markdown is the source of truth. Layouts only render it.
- Filenames begin with `YYYY-MM-DD-`. Slugs are stable after publish.
- Edit Tailwind/CSS in `src/styles/main.css`; `src/assets/css/main.css`
  is generated.
- Logo is an inline SVG in `src/_includes/partials/mark.njk`. Edit
  there; it is referenced wherever the mark appears.
- No analytics, no tracking, no newsletter signup.

## License

Site content: © Haha Systems. Code in this repository: MIT (see source
headers if present, otherwise treat as MIT).
