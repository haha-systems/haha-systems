# Handoff — Haha Systems

A markdown-first Eleventy site. Five sections (Notes, Writings, Documents,
Projects, Arachne) plus a home index. Restrained, archival visual treatment;
no gradients, no stock imagery, no marketing copy.

## Repository layout

```
haha-systems/
├── .eleventy.js              # collections + filters + pathPrefix from env
├── package.json              # Bun scripts: clean, build:css, build, serve, watch
├── netlify.toml              # build config for Netlify
├── vercel.json               # build config for Vercel
├── README.md                 # full developer doc
├── HANDOFF.md                # this file
├── .nvmrc                    # Node 20
├── .gitignore
└── src/
    ├── index.njk             # home
    ├── 404.njk
    ├── feed.njk              # /feed.xml (Atom)
    ├── robots.njk            # /robots.txt
    ├── _data/
    │   ├── site.js           # title, sections list, metadata
    │   └── eleventyComputed.js
    ├── _includes/
    │   ├── layouts/
    │   │   ├── base.njk      # html shell + path-prefix shim
    │   │   ├── page.njk      # static page wrapper
    │   │   ├── entry.njk     # single-entry layout (used by all md entries)
    │   │   └── section.njk   # section index list
    │   └── partials/
    │       ├── header.njk    # site header w/ inline SVG mark
    │       ├── footer.njk
    │       └── mark.njk      # the SVG logo (edit here once)
    ├── styles/main.css       # Tailwind source stylesheet
    ├── assets/css/main.css   # generated stylesheet
    ├── notes/                # 3 sample entries + index.njk + notes.json
    ├── writings/             # 2 sample entries + index.njk + writings.json
    ├── documents/            # 2 sample entries + index.njk + documents.json
    ├── projects/             # 2 sample entries + index.njk + projects.json
    └── arachne/              # 3 sample entries + index.njk + arachne.json
```

Each `<section>/<section>.json` directory data file applies `layout: layouts/entry.njk`,
`section`, `permalink`, and `tags` to every Markdown file in that directory.

## Commands

```sh
bun install
bun run build           # compile Tailwind, then → _site/
bun run serve           # http://localhost:8080
SITE_URL=https://example.org bun run build  # absolute URLs in feed/OG
PATH_PREFIX=/foo/ bun run build             # build under a non-root path
```

## Design decisions

- **Type:** Gambarino (display serif, Fontshare) for titles and prose; Switzer
  (sans, Fontshare) as a quiet UI fallback; JetBrains Mono for chrome (nav,
  dates, meta). Two voices, no more.
- **Palette:** Warm paper (`#efece4`) with deep ink and a single restrained
  burnt-umber accent. Dark mode via `prefers-color-scheme` only. No gradients,
  no shadows.
- **Layout:** Single-column prose at ~64ch. Home uses a flat 4-column section
  grid that collapses gracefully. Generous whitespace, single horizontal rule
  per region.
- **Logo:** Inline SVG in `partials/mark.njk` — a square frame bisected with a
  centered circle. Reads as a workshop / mechanism glyph at 24px and 200px.
  Uses `currentColor`.
- **Tone:** First-person where needed, otherwise none. No press-release voice.
  Sample content (e.g. "Against roadmaps, briefly", "Reading source as primary
  literature") demonstrates voice without filler.

## Authoring an entry

1. Create `src/<section>/YYYY-MM-DD-slug.md`.
2. Frontmatter: `title`, `date`, optional `summary`.
3. Body in plain Markdown.
4. Build (or run dev server) — entry appears in section index and on home.

The full canonical version of these rules lives at `/documents/authoring-conventions/`.

## Adding a new section

1. `mkdir src/<section>` and add a `<section>.json` directory data file
   (copy from any existing one).
2. `src/<section>/index.njk` using `layouts/section.njk`.
3. Add the section to `src/_data/site.js` `sections`.
4. Add a collection in `.eleventy.js`.
5. Optionally add a CSS hook if the section needs a custom treatment.

## Deployment

- **Netlify:** repo includes `netlify.toml`. Connect, accept defaults.
- **Vercel:** repo includes `vercel.json`. Import, accept defaults.
- **Other static hosts (Cloudflare Pages, GitHub Pages, S3, etc.):** run
  `npm run build`, upload `_site/`. Set `SITE_URL` for absolute feed/OG URLs.
- **Private preview** (deploy_website tool): the `base.njk` includes a small
  inline JS shim that detects when the site is served under a proxy path
  prefix and rewrites root-absolute URLs accordingly. This is a no-op for
  real domain deploys.

## Path-prefix shim

`src/_includes/layouts/base.njk` contains a small inline script that:

1. Compares `location.pathname` against the page's logical Eleventy URL.
2. Computes the prefix (everything before the logical URL).
3. Injects the stylesheet with that prefix, so first paint is styled.
4. On `DOMContentLoaded`, rewrites all root-absolute `href`/`src` attributes
   to include the prefix.

For a normal domain deploy the prefix is empty and the script does nothing.

## Conventions for incremental edits

- New entries should not require touching layouts or CSS.
- Layout changes belong in `src/_includes/`.
- Edit styling in `src/styles/main.css`; Tailwind generates `src/assets/css/main.css`.
- The mark is edited once in `src/_includes/partials/mark.njk`.
- After editing, run `bun run build` and re-deploy (`deploy_website` for the
  private preview, or push to the connected Netlify/Vercel repo for prod).

## Git

```
$ git log --oneline
7ceffd1 Add path-prefix shim so the site works under proxied preview URLs
0b69881 Initial scaffold: Eleventy site with five sections, sample content, deploy configs
```
