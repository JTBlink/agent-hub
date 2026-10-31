import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";

/** Languages are bundled locally and loaded only when a matching file is opened. */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: "Python",
    extensions: ["py", "pyw"],
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "jsx"],
    extensions: ["js", "jsx", "mjs", "cjs"],
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: true }),
      ),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "tsx"],
    extensions: ["ts", "tsx", "mts", "cts"],
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ typescript: true, jsx: true }),
      ),
  }),
  LanguageDescription.of({
    name: "JSON",
    extensions: ["json"],
    load: () => import("@codemirror/lang-json").then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yml"],
    extensions: ["yaml", "yml"],
    load: () => import("@codemirror/lang-yaml").then((m) => m.yaml()),
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rs"],
    extensions: ["rs"],
    load: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["sh", "bash", "zsh"],
    extensions: ["sh", "bash", "zsh"],
    load: async () => {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return new LanguageSupport(StreamLanguage.define(shell));
    },
  }),
  LanguageDescription.of({
    name: "PowerShell",
    alias: ["ps1"],
    extensions: ["ps1", "psm1", "psd1"],
    load: async () => {
      const { powerShell } =
        await import("@codemirror/legacy-modes/mode/powershell");
      return new LanguageSupport(StreamLanguage.define(powerShell));
    },
  }),
  LanguageDescription.of({
    name: "TOML",
    extensions: ["toml"],
    load: async () => {
      const { toml } = await import("@codemirror/legacy-modes/mode/toml");
      return new LanguageSupport(StreamLanguage.define(toml));
    },
  }),
  LanguageDescription.of({
    name: "Markdown",
    alias: ["md"],
    extensions: ["md", "markdown"],
    load: () =>
      import("@codemirror/lang-markdown").then((m) =>
        m.markdown({ codeLanguages }),
      ),
  }),
];

export function languageForPath(path: string) {
  return LanguageDescription.matchFilename(codeLanguages, path.toLowerCase());
}
