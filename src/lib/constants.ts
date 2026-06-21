// Shared OneDrive root where per-site document folders live. Used as the
// fallback target for the Documents button and as the parent under which the
// Graph integration creates each site's folder. Override with the
// ONEDRIVE_ROOT_SHARE_URL env var if the folder ever moves.
export const ONEDRIVE_ROOT =
  "https://actsyslimited-my.sharepoint.com/:f:/g/personal/vanessa_changes4life_co_uk/IgB7THi35r1OQ7RRxtYfbm2SAXjNtLJgfI2c070JLyroL_0?e=0CsNck";

export const SITE_SUBFOLDERS = ["Photos", "Architect", "Planning", "Investors", "Costs"];
