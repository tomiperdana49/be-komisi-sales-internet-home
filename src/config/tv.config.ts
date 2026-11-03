export const tvConfig = {
  /**
   * Shared key for the no-login TV lounge screen (GET /tv/sales?key=...). The TV opens
   * the frontend's /tv?key=... page. Empty = the TV endpoint is off (404).
   */
  displayKey: process.env.TV_DISPLAY_KEY || null,
  /**
   * Python (with rembg installed) that cuts the background out of winner photos via
   * scripts/cutout.py, e.g. /opt/rembg/venv/bin/python. Empty = original photos only.
   */
  cutoutPython: process.env.TV_CUTOUT_PYTHON || null,
  /** How long one computed screen is reused, so many TVs refreshing don't recompute every AM's commission. */
  cacheMs: 2 * 60 * 1000,
};
