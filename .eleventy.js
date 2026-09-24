const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  // Pass through static assets
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // Watch CSS so dev server reloads on style changes
  eleventyConfig.addWatchTarget("./src/assets/");
  eleventyConfig.addWatchTarget("./src/styles/");

  // ---------- Filters ----------
  eleventyConfig.addFilter("isoDate", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return DateTime.fromJSDate(d, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.addFilter("readableDate", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    const date = DateTime.fromJSDate(d, { zone: "utc" });
    const suffix =
      date.day % 100 >= 11 && date.day % 100 <= 13
        ? "th"
        : { 1: "st", 2: "nd", 3: "rd" }[date.day % 10] || "th";
    return `${date.day}${suffix} ${date.toFormat("LLLL yyyy")}`;
  });

  eleventyConfig.addFilter("year", (value) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    return DateTime.fromJSDate(d, { zone: "utc" }).toFormat("yyyy");
  });

  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  eleventyConfig.addFilter("sortByDateDesc", (arr) =>
    (arr || []).slice().sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      return bd - ad;
    })
  );

  // ---------- Collections ----------
  // Each section is sourced from its directory; ordering is most-recent-first.
  const byDateDesc = (a, b) => b.date - a.date;

  eleventyConfig.addCollection("notes", (api) =>
    api.getFilteredByGlob("./src/notes/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("writing", (api) =>
    api.getFilteredByGlob("./src/writing/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("research", (api) =>
    api.getFilteredByGlob("./src/research/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("projects", (api) =>
    api.getFilteredByGlob("./src/projects/*.md").sort(byDateDesc)
  );
  eleventyConfig.addCollection("cv", (api) =>
    api.getFilteredByGlob("./src/cv/*.md").sort(byDateDesc)
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    pathPrefix: process.env.PATH_PREFIX || "/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"],
  };
};
