module.exports = {
  title: "Haha Systems",
  tagline: "Notes, writings, documents, projects.",
  description:
    "Haha Systems is a working notebook: notes, writings, documents, projects, and Arachne.",
  url: process.env.SITE_URL || "",
  lang: "en",
  author: "Haha Systems",
  // Section metadata (used to render the site nav and section index pages).
  sections: [
    { slug: "notes",     title: "Notes",     blurb: "Short, dated entries. Working memory." },
    { slug: "writings",  title: "Writings",  blurb: "Longer pieces, edited at least once." },
    { slug: "documents", title: "Documents", blurb: "Specifications, plans, references." },
    { slug: "projects",  title: "Projects",  blurb: "Things being built, in various states of repair." },
    { slug: "arachne",   title: "Arachne",   blurb: "A thread, kept separately." }
  ]
};
