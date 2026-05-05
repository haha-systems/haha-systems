---
title: Site architecture
date: 2025-05-04
summary: How the site is generated, where files live, and how to extend it.
---

The site is a static build produced by [Eleventy](https://www.11ty.dev/).
Markdown files in section directories are rendered with Nunjucks layouts
and written to `_site/`. There is no client-side framework and no
runtime database.

## Directory layout

```
src/
  _data/site.js              site-wide metadata + section list
  _includes/
    layouts/                 base, page, entry, section
    partials/                header, footer, mark (svg)
  assets/css/main.css        the entire stylesheet
  notes/                     section: notes/*.md + index.njk
  writings/                  section: writings/*.md + index.njk
  documents/                 section: documents/*.md + index.njk
  projects/                  section: projects/*.md + index.njk
  arachne/                   section: arachne/*.md + index.njk
  index.njk                  home page
.eleventy.js                 Eleventy config (collections, filters)
package.json                 build/serve scripts
```

## Build

```sh
npm install
npm run build     # writes _site/
npm run serve     # local dev server with watch
```

## Adding a new entry

1. Pick the section.
2. Create `YYYY-MM-DD-slug.md` in that directory.
3. Frontmatter: `title`, `date`, optional `summary`.
4. Save. The build picks it up; it will appear in the section index and,
   if recent enough, on the home page.

## Adding a new section

1. Create the directory under `src/`.
2. Add a section data file (e.g. `things.json`) defining the layout,
   permalink, section name, and tag.
3. Add an `index.njk` using the `layouts/section.njk` layout.
4. Register the section in `src/_data/site.js` `sections` array and add
   a collection in `.eleventy.js`.
