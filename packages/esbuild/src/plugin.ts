import { readFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BuildResult,
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  Plugin,
  PluginBuild,
} from "esbuild";

import {
  loadVirtualModule,
  resolveInspectorOptions,
  resolveVirtualId,
  shouldAttemptTransform,
  toOverlayOptionsInput,
  toRuntimeBootstrapConfig,
  toServerOptions,
  toTransformOptions,
  type MithrilInspectorOptions,
  type VirtualModuleDeps,
} from "@mithril-inspector/adapter-kit";
import { transformMithrilModule } from "@mithril-inspector/transform";

import { createEsbuildDevServer } from "./dev-server.js";
import type { EsbuildDevServerHandle } from "./dev-server.js";

export type { MithrilInspectorOptions };

/** esbuild-specific option: opt in to the helper open-in-editor dev server (§12.4). */
export interface MithrilInspectorEsbuildOptions extends MithrilInspectorOptions {
  /**
   * Start a companion static-file + open-in-editor server (reusing
   * `@mithril-inspector/server`) once the first build completes. Off by
   * default — esbuild has no dev-server hook of its own to hang this on, so
   * it is opt-in rather than automatic (§12.4: "a helper development server
   * *may* be provided").
   */
  devServer?: { servedir: string; host?: string; port?: number } | false;
}

const VIRTUAL_NAMESPACE = "mithril-inspector-virtual";
const VIRTUAL_FILTER = /^virtual:mithril-inspector\//;
const TRANSFORM_FILTER = /\.[cm]?[jt]sx?$/;

const LOADER_BY_EXT: Readonly<Record<string, Loader>> = {
  ".ts": "ts",
  ".mts": "ts",
  ".cts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
};

function loaderForPath(path: string): Loader {
  return LOADER_BY_EXT[extname(path)] ?? "js";
}

/**
 * Directory the virtual runtime/overlay bootstrap modules resolve their own
 * `@mithril-inspector/runtime`/`overlay` imports against. Those bare
 * specifiers aren't necessarily resolvable from the *consuming* project (they
 * may not depend on those packages directly, e.g. under pnpm's isolated
 * `node_modules`), so `onLoad` needs an explicit `resolveDir` — this
 * package's own directory, which does declare them as dependencies. The
 * Vite/Rollup adapters need the analogous fix via `resolveId`/`this.resolve`
 * (see `@mithril-inspector/vite`'s `plugin.ts`) — their default resolution
 * falls back to the project root for a non-file importer, which has the same
 * failure mode as esbuild's lack of an inferred `resolveDir`.
 */
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The esbuild integration for Mithril Inspector (§4, §12.4): a single plugin
 * built from `build.onResolve`/`build.onLoad`/`build.onEnd`, over the same
 * shared transform (`@mithril-inspector/transform`) and virtual-module/option
 * plumbing (`@mithril-inspector/adapter-kit`) every other adapter reuses
 * (§12.1, ADR-004).
 *
 * Unlike Vite/Rollup, esbuild always bundles into concrete output files (no
 * on-demand ESM module graph, no HTML transform hook), so:
 *
 * - the virtual runtime/overlay modules are resolved into a dedicated
 *   `mithril-inspector-virtual` namespace via `onResolve` and served via
 *   `onLoad`, then bundled directly into whichever output chunk imports them
 *   (§11.2 analog — esbuild has no `\0`-prefix convention of its own, a
 *   plugin namespace is the idiomatic equivalent);
 * - overlay bootstrap injection is the application's responsibility (esbuild
 *   has no `transformIndexHtml` equivalent) — see the package README for the
 *   two documented patterns: a guarded `import "virtual:mithril-inspector/overlay"`
 *   in application code, or a dedicated entry point plus a manual
 *   `<script>` tag for zero application-code edits.
 *
 * Dev-only guard (§2.1 analog): active only when `enabled` (default:
 * `NODE_ENV !== "production"`, unchanged from every other adapter) **and**
 * the build is not minified, unless `includeInProduction` is set. esbuild has
 * no `command === "build"` distinction a plugin can read the way Vite does,
 * so `initialOptions.minify` is used as the production signal instead —
 * meaning a plain `esbuild --minify` run excludes inspector code even
 * without `NODE_ENV=production` (§12.4 AC: "production/minified builds
 * exclude all inspector code by default").
 *
 * `onEnd` is used only to lazily start (once, on the first completed build)
 * the optional `devServer` companion — see `dev-server.ts`; `onDispose`
 * stops it when the build context is disposed.
 *
 * @param env injectable environment for the `NODE_ENV` dev-default (§2.1),
 *   defaulting to `process.env`; primarily a test seam.
 */
export function mithrilInspector(
  options: MithrilInspectorEsbuildOptions = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): Plugin {
  const resolved = resolveInspectorOptions(options, env);

  const virtualDeps: VirtualModuleDeps = {
    runtimeConfig: toRuntimeBootstrapConfig(resolved),
    overlayOptions: toOverlayOptionsInput(resolved),
  };

  return {
    name: "mithril-inspector",
    setup(build: PluginBuild) {
      const root =
        resolved.root ?? build.initialOptions.absWorkingDir ?? process.cwd();
      const transformOptions = toTransformOptions(resolved, root);
      const isMinified = build.initialOptions.minify === true;
      const isActive =
        resolved.enabled && (!isMinified || resolved.includeInProduction);

      if (!isActive) return;

      build.onResolve({ filter: VIRTUAL_FILTER }, (args: OnResolveArgs) => {
        const resolvedId = resolveVirtualId(args.path);
        return resolvedId === null
          ? null
          : { path: resolvedId, namespace: VIRTUAL_NAMESPACE };
      });

      build.onLoad(
        { filter: /.*/, namespace: VIRTUAL_NAMESPACE },
        (args: OnLoadArgs): OnLoadResult | null => {
          const code = loadVirtualModule(args.path, virtualDeps);
          return code === null
            ? null
            : { contents: code, loader: "js", resolveDir: PACKAGE_DIR };
        },
      );

      build.onLoad(
        { filter: TRANSFORM_FILTER },
        async (args: OnLoadArgs): Promise<OnLoadResult | null> => {
          if (!shouldAttemptTransform(args.path)) return null;
          const code = await readFile(args.path, "utf8");
          const result = transformMithrilModule({
            id: args.path,
            code,
            ...transformOptions,
          });
          if (result === null) return null;
          const contents =
            result.map !== undefined
              ? `${result.code}\n//# sourceMappingURL=${result.map.toUrl()}\n`
              : result.code;
          return {
            contents,
            loader: loaderForPath(args.path),
            resolveDir: dirname(args.path),
          };
        },
      );

      const devServerOption = options.devServer;
      if (devServerOption !== undefined && devServerOption !== false) {
        let handle: EsbuildDevServerHandle | undefined;
        let starting: Promise<void> | undefined;

        build.onEnd((_result: BuildResult) => {
          if (starting !== undefined) return undefined;
          starting = createEsbuildDevServer({
            servedir: devServerOption.servedir,
            ...(devServerOption.host !== undefined
              ? { host: devServerOption.host }
              : {}),
            ...(devServerOption.port !== undefined
              ? { port: devServerOption.port }
              : {}),
            inspector: toServerOptions(resolved, root),
          }).then((startedHandle) => {
            handle = startedHandle;
            console.log(
              `[mithril-inspector] open-in-editor endpoint ready: ${startedHandle.url}`,
            );
          });
          // esbuild awaits a returned Promise before the build is considered
          // finished, so the "ready" log (and the server itself) is
          // guaranteed up by the time `onEnd` resolves, on this first call
          // only — later rebuilds see `starting` already set and return
          // immediately rather than re-awaiting an already-settled promise.
          return starting;
        });

        build.onDispose(() => {
          void starting?.then(() => handle?.close());
        });
      }
    },
  };
}
