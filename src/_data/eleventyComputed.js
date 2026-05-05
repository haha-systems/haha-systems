// Lightweight computed defaults available to every template.
module.exports = {
  // Page meta description falls back to the per-page description, then site description.
  metaDescription: (data) =>
    data.description || (data.site && data.site.description) || ""
};
