---
title: Authoring conventions
date: 2025-05-01
summary: How entries are written, named, and filed on this site.
eleventyExcludeFromCollections: true
permalink: false
layout: false
---

This document describes the conventions used to author entries on
Haha Systems. It exists so that the rules are explicit and so that any
deviation is intentional.

## File names

Entries live as Markdown files inside one of the section directories. 

File names follow the pattern:

```
YYYY-MM-DD-short-slug.md
```

The date prefix orders entries on disk in the same order they are sorted
by the build. The slug is short, lower-case, hyphen-separated, and
purely descriptive; it should not change after publication.

## Frontmatter

Every entry begins with a small YAML block:

```yaml
---
title: Authoring conventions
date: 2025-05-01
summary: One sentence describing the entry.
---
```

`title` and `date` are required. `summary` is optional but strongly
recommended; it appears in section indexes and on the home page.

## Sections

| Section     | Used for                                                      |
| ----------- | ------------------------------------------------------------- |
| notes       | Short, dated entries. No commitment to revision.              |
| writing     | Longer pieces, edited at least once before publication.       |
| research    | Research notes and results                                    |
| projects    | One entry per project, updated as the project changes.        |
| cv          | A record of my work                                           |

## Voice

Plain. First person if needed; otherwise none. No sales tone. Avoid
declaring the work "frontier" or the writing "definitive." If a claim
sounds like a press release, cut it.
