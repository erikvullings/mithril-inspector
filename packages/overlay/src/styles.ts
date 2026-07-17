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
.mi-tab, .mi-panel { pointer-events: auto; }

/* --- Collapsed tab (§8.1) ------------------------------------------------ */
.mi-tab {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--mi-border);
  border-radius: var(--mi-radius);
  background: var(--mi-bg);
  color: var(--mi-fg);
  box-shadow: var(--mi-shadow);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.mi-tab:hover { background: var(--mi-surface); }
.mi-tab .mi-diamond { color: var(--mi-accent); }

.mi-pos-bottom-right .mi-tab, .mi-pos-bottom-right .mi-panel { bottom: 16px; right: 16px; }
.mi-pos-bottom-left .mi-tab, .mi-pos-bottom-left .mi-panel { bottom: 16px; left: 16px; }
.mi-pos-top-right .mi-tab, .mi-pos-top-right .mi-panel { top: 16px; right: 16px; }
.mi-pos-top-left .mi-tab, .mi-pos-top-left .mi-panel { top: 16px; left: 16px; }

/* --- Expanded panel (§8.3) ---------------------------------------------- */
.mi-panel {
  position: absolute;
  width: 340px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: var(--mi-bg);
  border: 1px solid var(--mi-border);
  border-radius: var(--mi-radius);
  box-shadow: var(--mi-shadow);
  overflow: hidden;
}

.mi-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--mi-border);
  cursor: grab;
}
.mi-panel-title { font-weight: 700; flex: 1; }

.mi-tablist { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--mi-border); }
.mi-tabbtn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--mi-muted);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
.mi-tabbtn[aria-selected="true"] { background: var(--mi-surface); color: var(--mi-fg); font-weight: 600; }

.mi-panel-body { padding: 12px; overflow: auto; }

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
}
.mi-btn:hover { border-color: var(--mi-accent); }
.mi-btn-primary { background: var(--mi-accent); color: var(--mi-accent-fg); border-color: var(--mi-accent); }
.mi-btn[aria-pressed="true"] { background: var(--mi-accent); color: var(--mi-accent-fg); border-color: var(--mi-accent); }
.mi-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mi-row { display: grid; grid-template-columns: 84px 1fr; gap: 4px 8px; margin-bottom: 8px; }
.mi-key { color: var(--mi-muted); }
.mi-val { font-family: var(--mi-mono); word-break: break-all; }
.mi-actions { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.mi-section-title { font-weight: 700; margin: 12px 0 6px; }
.mi-hr { height: 1px; background: var(--mi-border); border: 0; margin: 10px 0; }
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

.mi-ancestry { list-style: none; padding: 0; margin: 0; }
.mi-ancestry li { padding: 4px 0; font-family: var(--mi-mono); }
.mi-ancestry .mi-depth { color: var(--mi-muted); }
.mi-ancestry-focused { background: var(--mi-surface); border-radius: 6px; }
.mi-ancestry-name {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--mi-fg);
  font: inherit;
  font-family: var(--mi-mono);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-decoration-color: transparent;
}
.mi-ancestry-name:hover { text-decoration-color: currentColor; }
.mi-ancestry-actions { margin: 4px 0 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

.mi-btn-small { padding: 3px 8px; font-size: 11px; font-weight: 600; }
.mi-reveal-choices { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; font-family: var(--mi-font); }

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
