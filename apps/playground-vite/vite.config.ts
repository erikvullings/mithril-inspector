import { defineConfig } from "vite";
import { mithrilInspector } from "@mithril-inspector/vite";

// Zero-config usage (§2.2, §24): no other app-code changes are required.
// mode: "full" and componentTree.enabled are the defaults; editor: "code" is
// spelled out here only to keep the playground deterministic in CI regardless
// of the host's $EDITOR.
export default defineConfig({
  plugins: [
    mithrilInspector({
      editor: "code",
    }),
  ],
});
