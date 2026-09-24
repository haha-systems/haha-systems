module.exports = {
  title: "Haha Systems",
  tagline: "Notes, writing, research, projects, and a CV.",
  description:
    "Haha Systems is a working notebook for notes, writing, research, projects, and a CV.",
  url: process.env.SITE_URL || "",
  lang: "en",
  // Google Fonts. Families listed here are requested from fonts.googleapis.com
  // in the <head> (see _includes/layouts/base.njk) and referenced by the CSS
  // custom properties --font-sans / --font-mono in src/styles/main.css.
  fonts: {
    // Each entry becomes one `family=` parameter on the CSS2 API URL.
    families: [
      "Habibi:wght@400;500;600",
      "JetBrains+Mono:wght@400;500"
    ],
    display: "swap"
  },
  author: "Haha Systems",
  // Section metadata (used to render the site nav and section index pages).
  sections: [
    { slug: "notes",     title: "Notes",     blurb: "Short, dated entries. Working memory." },
    { slug: "writing",  title: "Writing",  blurb: "Longer pieces, edited at least once." },
    { slug: "research", title: "Research", blurb: "Questions. Questions that need answering." },
    { slug: "projects",  title: "Projects",  blurb: "Personal projects, some open-source." },
    { slug: "cv",   title: "CV",   blurb: "What I've done." }
  ]
};
