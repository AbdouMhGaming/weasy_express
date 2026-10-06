import postcss from "postcss";
import { Features, transform } from "lightningcss";
import type { Plugin } from "vite";

const targets = { chrome: 100 << 16, firefox: 100 << 16, safari: (15 << 16) | (4 << 8) };
// Tailwind 4's gradients and color-mix declarations otherwise disappear in
// Chrome 109 (the last Chrome release for several older client computers).
export function compatibleCss(): Plugin {
  return {
    name: "weasy-compatible-css", enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith(".css") || !code.includes("--tw-")) return null;
      const root = postcss.parse(code);
      const tokens = new Map<string, string>();
      const defaults: string[] = [];
      root.walkDecls(decl => {
        if (decl.prop.startsWith("--color-")) tokens.set(decl.prop, decl.value);
      });
      root.walkAtRules("property", rule => {
        rule.walkDecls("initial-value", decl => {
          if (decl.value !== "initial") defaults.push(`${rule.params}:${decl.value}`);
        });
      });
      const resolve = (value: string): string => {
        for (let i = 0; i < 5; i++) {
          const next = value.replace(/var\((--color-[\w-]+)\)/g, (match, token) => tokens.get(token) ?? match);
          if (next === value) break;
          value = next;
        }
        return value;
      };
      root.walkDecls(decl => {
        if (/\b\d+(?:\.\d+)?dvh\b/.test(decl.value)) decl.cloneBefore({ value: decl.value.replace(/dvh\b/g, "vh") });
        if (decl.prop === "--tw-gradient-position") decl.value = decl.value.replace(/\s+in\s+oklab/g, "");
        if (!decl.value.includes("color-mix")) return;
        const fallback = decl.value.replace(/color-mix\(in (?:oklab|srgb),\s*(.+?)\s+([\d.]+)%,\s*transparent\)/g, (original, color, percent) => {
          const resolved = resolve(color);
          if (resolved.includes("var(")) return color; // preserve theme-dependent color, without unsupported alpha mixing
          try {
            const compiled = transform({ code: Buffer.from(`a{color:color-mix(in oklab,${resolved} ${percent}%,transparent)}`), targets, include: Features.Colors, minify: true }).code.toString();
            return compiled.match(/color:([^;}]+)/)?.[1] ?? original;
          } catch { return original; }
        });
        if (fallback !== decl.value) decl.cloneBefore({ value: fallback });
      });
      if (defaults.length) root.append(`@layer theme{*,::before,::after{${defaults.join(";")}}}`);
      return { code: transform({ code: Buffer.from(root.toString()), targets, include: Features.Colors | Features.Nesting | Features.MediaQueries }).code.toString(), map: null };
    },
  };
}
