/**
 * The overlay's scoped stylesheet. It lives entirely inside the shadow root
 * (§8.2) so it adds no global styles and cannot leak into the host page. It is
 * theme-aware — following `prefers-color-scheme` by default with explicit
 * light/dark overrides (§8.1) — meets WCAG AA contrast, shows visible focus
 * indicators, and respects reduced-motion (§18).
 *
 * The root layer never captures pointer events; only the visible interactive
 * pieces opt back in with `pointer-events: auto` (§8.1).
 */
export function overlayCss(): string {
  return `
:host { all: initial; }

.mi-root {
  --mi-z: 2147483000;
  --mi-bg: #ffffff;
  --mi-fg: #1b1b1f;
  --mi-muted: #5a5a66;
  --mi-border: #d5d5dd;
  --mi-surface: #f4f4f7;
  --mi-accent: #1a56db;
  --mi-accent-fg: #ffffff;
  --mi-exact: #067647;
  --mi-inferred: #9a6700;
  --mi-danger: #b42318;
  --mi-highlight: #1a56db;
  --mi-highlight-fill: rgba(26, 86, 219, 0.12);
  --mi-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  --mi-radius: 8px;
  --mi-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mi-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  position: fixed;
  inset: 0;
  z-index: var(--mi-z);
  pointer-events: none;
  font-family: var(--mi-font);
  font-size: 13px;
  line-height: 1.45;
  color: var(--mi-fg);
}

@media (prefers-color-scheme: dark) {
  .mi-root:not([data-theme="light"]) {
    --mi-bg: #1e1e24;
    --mi-fg: #f2f2f6;
    --mi-muted: #a9a9b6;
    --mi-border: #3a3a44;
    --mi-surface: #2a2a32;
    --mi-accent: #7aa2ff;
    --mi-accent-fg: #10121a;
    --mi-exact: #4ade80;
    --mi-inferred: #fbbf24;
    --mi-danger: #ff6b60;
    --mi-highlight: #7aa2ff;
    --mi-highlight-fill: rgba(122, 162, 255, 0.16);
    --mi-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
}

.mi-root[data-theme="dark"] {
  --mi-bg: #1e1e24;
  --mi-fg: #f2f2f6;
  --mi-muted: #a9a9b6;
  --mi-border: #3a3a44;
  --mi-surface: #2a2a32;
  --mi-accent: #7aa2ff;
  --mi-accent-fg: #10121a;
  --mi-exact: #4ade80;
  --mi-inferred: #fbbf24;
  --mi-danger: #ff6b60;
  --mi-highlight: #7aa2ff;
  --mi-highlight-fill: rgba(122, 162, 255, 0.16);
  --mi-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

.mi-root *, .mi-root *::before, .mi-root *::after { box-sizing: border-box; }

.mi-root :focus-visible {
  outline: 2px solid var(--mi-accent);
  outline-offset: 2px;
  border-radius: 3px;
}

/* Interactive surfaces opt back into pointer events. */
.mi-toggle, .mi-dock { pointer-events: auto; }

/* --- Collapsed toggle (§8.1) --------------------------------------------- */
/*
 * A "reverse U" (⊓) fused to the bottom edge: rounded top, flat/open bottom
 * flush with the viewport edge — like a tab handle poking up, not a floating
 * pill. Non-hovered it's just the "M" mark; hovering (or active picking)
 * widens it and splits in a second cell for the target/crosshair icon,
 * separated by a divider, with a glow halo.
 */
.mi-toggle {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  padding: 4px 2px 0;
  border: 1px solid var(--mi-border);
  border-bottom: none;
  border-radius: 18px 18px 0 0;
  background: var(--mi-bg);
  box-shadow: var(--mi-shadow);
  opacity: 0.55;
  transition: opacity 150ms, box-shadow 150ms;
  overflow: hidden;
}
.mi-toggle:hover, .mi-toggle:focus-within, .mi-toggle-active {
  opacity: 1;
  box-shadow: 0 0 0 4px var(--mi-highlight-fill), var(--mi-shadow);
}
.mi-toggle-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-fg);
  width: 30px;
  height: 26px;
  border-radius: 14px 14px 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}
.mi-toggle-btn:hover { background: var(--mi-surface); }
.mi-toggle-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mi-toggle-pick {
  width: 0;
  height: 26px;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  color: var(--mi-muted);
  border-left: 1px solid transparent;
  transition: width 150ms, opacity 150ms, border-color 150ms;
}
.mi-toggle:hover .mi-toggle-pick,
.mi-toggle:focus-within .mi-toggle-pick,
.mi-toggle-active .mi-toggle-pick {
  width: 30px;
  opacity: 1;
  pointer-events: auto;
  border-left-color: var(--mi-border);
}
.mi-toggle-pick.mi-active { color: var(--mi-accent); }

/* --- Docked panel (§8.3) ------------------------------------------------- */
/* Capped at 80% of the viewport (and an absolute max), centered — never a
 * full-bleed bar, even on wide monitors. */
.mi-dock {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: min(80vw, 1100px);
  height: min(46vh, 520px);
  min-height: 300px;
  display: flex;
  background: var(--mi-bg);
  border: 1px solid var(--mi-border);
  border-bottom: none;
  border-radius: var(--mi-radius) var(--mi-radius) 0 0;
  box-shadow: var(--mi-shadow);
}

.mi-sidebar {
  width: 44px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  border-right: 1px solid var(--mi-border);
  gap: 2px;
}
.mi-sidebar-logo {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-accent);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  margin-bottom: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}
.mi-sidebar-logo:hover { background: var(--mi-surface); }
.mi-sidebar-spacer { flex: 1; }
.mi-sidebar-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-muted);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.mi-sidebar-btn:hover { background: var(--mi-surface); color: var(--mi-fg); }
.mi-sidebar-btn[aria-pressed="true"] { background: var(--mi-highlight-fill); color: var(--mi-accent); }

.mi-main { flex: 1; display: flex; min-width: 0; }
.mi-tree-pane {
  width: 300px;
  flex: 0 0 auto;
  border-right: 1px solid var(--mi-border);
  padding: 10px;
  overflow: auto;
}
.mi-detail-pane { flex: 1; min-width: 0; padding: 10px 14px; overflow: auto; }
.mi-detail-empty { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
.mi-settings { flex: 1; min-width: 0; padding: 12px 16px; overflow: auto; }

@media (max-width: 640px) {
  .mi-main { flex-direction: column; }
  .mi-tree-pane { width: auto; max-height: 45%; border-right: 0; border-bottom: 1px solid var(--mi-border); }
}

/* --- Icon buttons (§8.3) -------------------------------------------------- */
.mi-icon-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--mi-fg);
  width: 30px;
  height: 30px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 120ms, background 120ms;
}
.mi-icon-btn:hover { background: var(--mi-surface); border-color: var(--mi-border); }
.mi-icon-btn[aria-pressed="true"] { background: var(--mi-accent); color: var(--mi-accent-fg); }
.mi-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mi-icon-btn-small { width: 26px; height: 26px; }

.mi-btn {
  appearance: none;
  border: 1px solid var(--mi-border);
  background: var(--mi-surface);
  color: var(--mi-fg);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  transition: border-color 120ms, background 120ms;
}
.mi-btn:hover { border-color: var(--mi-accent); }
.mi-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mi-btn-small { padding: 3px 8px; font-size: 11px; font-weight: 600; border: 1px solid var(--mi-border); border-radius: 6px; background: var(--mi-surface); color: var(--mi-fg); cursor: pointer; }
.mi-btn-small:hover { border-color: var(--mi-accent); }

.mi-row { display: grid; grid-template-columns: 84px 1fr; gap: 4px 8px; margin-bottom: 8px; }
.mi-key { color: var(--mi-muted); }
.mi-val { font-family: var(--mi-mono); word-break: break-all; }
.mi-section-title {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mi-muted);
  margin: 16px 0 8px;
}
.mi-hr { height: 1px; background: var(--mi-border); border: 0; margin: 14px 0; }
.mi-muted { color: var(--mi-muted); }
.mi-mono { font-family: var(--mi-mono); }

.mi-badge-precision {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.mi-precision-exact { background: var(--mi-exact); color: #fff; }
.mi-precision-inferred { background: var(--mi-inferred); color: #1b1b1f; }
.mi-precision-none { background: var(--mi-border); color: var(--mi-fg); }

/* --- Selection meta + breadcrumb (§8.3, §9.1) ---------------------------- */
.mi-detail-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.mi-breadcrumb { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font-family: var(--mi-mono); margin-bottom: 4px; }
.mi-breadcrumb-sep { color: var(--mi-muted); }
.mi-crumb {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-muted);
  font: inherit;
  font-family: var(--mi-mono);
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
}
.mi-crumb:hover { background: var(--mi-surface); color: var(--mi-fg); }
.mi-crumb:disabled { cursor: not-allowed; opacity: 0.6; }
.mi-crumb-current { color: var(--mi-accent); font-weight: 700; }
.mi-crumb-focused { background: var(--mi-highlight-fill); }

.mi-toolbar { display: flex; align-items: center; gap: 2px; margin: 4px 0 12px; flex-wrap: wrap; }
.mi-toolbar-divider { width: 1px; height: 18px; background: var(--mi-border); margin: 0 4px; }

.mi-stale {
  border: 1px solid var(--mi-inferred);
  background: var(--mi-surface);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 10px;
}

/* --- Highlight rectangles (§8.6) ---------------------------------------- */
.mi-highlight-layer { position: absolute; inset: 0; pointer-events: none; }
.mi-rect {
  position: fixed;
  pointer-events: none;
  border: 1.5px solid var(--mi-highlight);
  background: var(--mi-highlight-fill);
  border-radius: 2px;
}
.mi-rect-frozen { border-style: dashed; }

/* --- Hover badge (§8.5) -------------------------------------------------- */
.mi-hover-badge {
  position: fixed;
  pointer-events: none;
  max-width: 320px;
  padding: 6px 9px;
  background: var(--mi-bg);
  color: var(--mi-fg);
  border: 1px solid var(--mi-border);
  border-radius: 6px;
  box-shadow: var(--mi-shadow);
  font-size: 12px;
}
.mi-hover-badge .mi-hb-component { font-weight: 700; }
.mi-hover-badge .mi-hb-element { color: var(--mi-muted); font-family: var(--mi-mono); }
.mi-hover-badge .mi-hb-source { font-family: var(--mi-mono); }

/* --- Picker active indicator (§18) -------------------------------------- */
.mi-picking-banner {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  margin-top: 8px;
  padding: 5px 12px;
  background: var(--mi-accent);
  color: var(--mi-accent-fg);
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  box-shadow: var(--mi-shadow);
}

/* --- Component tree (§9, task 0022) ------------------------------------- */
.mi-search-row { display: flex; align-items: center; gap: 4px; margin-bottom: 10px; }
.mi-search-icon { display: inline-flex; color: var(--mi-muted); flex: 0 0 auto; }
.mi-tree-search {
  display: block;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 9px;
  border: 1px solid var(--mi-border);
  border-radius: 6px;
  background: var(--mi-bg);
  color: var(--mi-fg);
  font: inherit;
}
.mi-tree { list-style: none; padding: 0; margin: 0 0 6px; }
.mi-tree li { border-radius: 6px; }
.mi-tree li:hover { background: var(--mi-surface); }
.mi-tree li[aria-selected="true"], .mi-tree li[aria-selected="true"]:hover { background: var(--mi-highlight-fill); }
.mi-tree li:focus-visible { outline: 2px solid var(--mi-accent); outline-offset: -2px; }
.mi-tree-row { display: flex; align-items: center; gap: 4px; padding: 3px 4px; font-family: var(--mi-mono); }
.mi-tree-chevron {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-muted);
  cursor: pointer;
  width: 16px;
  padding: 0;
  font: inherit;
}
.mi-tree-chevron-spacer { display: inline-block; width: 16px; }
.mi-tree-name {
  color: var(--mi-fg);
  font-family: var(--mi-mono);
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mi-tree-key { color: var(--mi-muted); }
.mi-badge-count {
  color: var(--mi-muted);
  font-size: 11px;
  border: 1px solid var(--mi-border);
  border-radius: 999px;
  padding: 0 5px;
}
.mi-pin-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-muted);
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
}
.mi-pin-btn:hover { background: var(--mi-surface); color: var(--mi-fg); }
.mi-pin-btn[aria-pressed="true"] { color: var(--mi-accent); }
.mi-pinned { list-style: none; padding: 0; margin: 0 0 8px; }
.mi-pinned li { display: flex; align-items: center; gap: 4px; padding: 2px 0; font-family: var(--mi-mono); }

/* --- Attrs/state preview tree (§7.4, task 0020/0022) -------------------- */
.mi-preview-node { font-family: var(--mi-mono); font-size: 12px; }
.mi-preview-entries { list-style: none; margin: 2px 0 4px 14px; padding: 0; }
.mi-preview-entries.mi-preview-root { margin: 0; }
.mi-preview-entries > li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  padding: 4px 0;
  border-bottom: 1px solid var(--mi-border);
}
.mi-preview-entries > li:last-child { border-bottom: 0; }
.mi-preview-key { color: var(--mi-muted); flex: 0 0 auto; }
.mi-preview-summary { font-weight: 600; }
.mi-preview-getter { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mi-mono); }
.mi-preview-value { font-family: var(--mi-mono); word-break: break-word; }

.mi-diagnostics { list-style: none; padding: 0; margin: 0; }
.mi-diagnostics li { border-left: 3px solid var(--mi-danger); padding: 4px 8px; margin-bottom: 6px; background: var(--mi-surface); }
.mi-diag-feature { font-weight: 700; }
.mi-empty { color: var(--mi-muted); font-style: italic; }

@media (prefers-reduced-motion: reduce) {
  .mi-root *, .mi-root *::before, .mi-root *::after {
    transition: none !important;
    animation: none !important;
    scroll-behavior: auto !important;
  }
}
`.trim()
}
