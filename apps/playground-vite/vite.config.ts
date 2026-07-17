import { defineConfig } from "vite"
import { mithrilInspector } from "@mithril-inspector/vite"

// Zero-config usage (§2.2, §24): no other app-code changes are required.
export default defineConfig({
  plugins: [mithrilInspector()],
})
