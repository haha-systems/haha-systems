# Repository Guidelines

## Project Structure & Module Organization

This is a markdown-first Eleventy static site. Source lives in `src/`; generated output goes to `_site/` and should not be edited directly. Layouts are in `src/_includes/layouts/`, reusable partials in `src/_includes/partials/`, and global data in `src/_data/`. Tailwind source CSS is `src/styles/main.css`; generated browser CSS is `src/assets/css/main.css`. Content sections live in `src/notes/`, `src/writing/`, `src/research/`, `src/projects/`, and `src/cv/`.

## Build, Test, and Development Commands

- `nvm use`: switch to Node 20 from `.nvmrc`.
- `bun install`: install Eleventy, Tailwind, and runtime dependencies.
- `bun run build:css`: compile Tailwind from `src/styles/main.css` to `src/assets/css/main.css`.
- `bun run serve`: compile CSS, then start Eleventy at `http://localhost:8080`.
- `bun run build`: compile CSS and build the static site into `_site/`.
- `bun run watch`: compile CSS, then run Eleventy in watch mode.
- `SITE_URL=https://example.org bun run build`: build with absolute feed/Open Graph URLs.

## Coding Style & Naming Conventions

Use 2-space indentation in JavaScript, Nunjucks, JSON, and CSS. Prefer CommonJS in Eleventy config files, matching `.eleventy.js`. Keep templates simple: layouts render content, directory data supplies shared metadata, and collections are defined in `.eleventy.js`. Name content files `YYYY-MM-DD-slug.md`; keep slugs stable after publishing. Edit the inline mark only in `src/_includes/partials/mark.njk`. Edit styling in `src/styles/main.css`; do not hand-edit generated `src/assets/css/main.css`.

## Testing Guidelines

There is no dedicated test framework in this repository. Validate changes with `bun run build` and inspect the generated `_site/` output or run `bun run serve` for browser checks. For content entries, verify frontmatter includes `title`, `date`, and, when useful, `summary`. For new sections, confirm the collection, section index, directory data file, and `src/_data/site.js` entry all agree.

## Commit & Pull Request Guidelines

Commit subjects must follow Conventional Commits and are enforced by `.githooks/commit-msg`, for example `feat: add section index pages` or `fix(css): balance home section borders`. Use one logical change per commit and avoid noisy generated output beyond required build artifacts. Pull requests should describe the content or behavior changed, list validation performed such as `bun run build`, link relevant issues, and include screenshots when layout or CSS changes affect visible pages.

## Security & Configuration Tips

Keep secrets out of the repo; `.env` and `.env.local` are ignored. Deployment config is in `netlify.toml` and `vercel.json`. Use `SITE_URL` for production builds so feeds and social metadata contain the correct absolute URLs.
