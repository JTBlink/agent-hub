import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from "@codemirror/language";

/** Languages are bundled locally and loaded only when a matching file is opened. */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: "C/C++",
    alias: ["c", "cpp", "c++"],
    extensions: ["c", "h", "cpp", "hpp", "cc", "hh", "cxx", "hxx"],
    load: async () => {
      const { cpp } = await import("@codemirror/legacy-modes/mode/clike");
      return new LanguageSupport(StreamLanguage.define(cpp));
    },
  }),
  LanguageDescription.of({
    name: "Java",
    extensions: ["java"],
    load: async () => {
      const { java } = await import("@codemirror/legacy-modes/mode/clike");
      return new LanguageSupport(StreamLanguage.define(java));
    },
  }),
  LanguageDescription.of({
    name: "C#",
    alias: ["cs", "csharp"],
    extensions: ["cs"],
    load: async () => {
      const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
      return new LanguageSupport(StreamLanguage.define(csharp));
    },
  }),
  LanguageDescription.of({
    name: "Go",
    extensions: ["go"],
    load: async () => {
      const { go } = await import("@codemirror/legacy-modes/mode/go");
      return new LanguageSupport(StreamLanguage.define(go));
    },
  }),
  LanguageDescription.of({
    name: "SQL",
    extensions: ["sql"],
    load: async () => {
      const { standardSQL } = await import("@codemirror/legacy-modes/mode/sql");
      return new LanguageSupport(StreamLanguage.define(standardSQL));
    },
  }),
  LanguageDescription.of({
    name: "HTML/XML",
    alias: ["html", "xml", "svg"],
    extensions: ["html", "htm", "xml", "svg", "xaml", "ui"],
    load: async () => {
      const { xml } = await import("@codemirror/legacy-modes/mode/xml");
      return new LanguageSupport(StreamLanguage.define(xml));
    },
  }),
  LanguageDescription.of({
    name: "CSS",
    extensions: ["css", "scss", "less"],
    load: async () => {
      const { css } = await import("@codemirror/legacy-modes/mode/css");
      return new LanguageSupport(StreamLanguage.define(css));
    },
  }),
  LanguageDescription.of({
    name: "Diff",
    alias: ["patch"],
    extensions: ["diff", "patch"],
    load: async () => {
      const { diff } = await import("@codemirror/legacy-modes/mode/diff");
      return new LanguageSupport(StreamLanguage.define(diff));
    },
  }),
  LanguageDescription.of({
    name: "Dockerfile",
    filename: /(^|\/)dockerfile(?:\.[^/]*)?$/i,
    load: async () => {
      const { dockerFile } =
        await import("@codemirror/legacy-modes/mode/dockerfile");
      return new LanguageSupport(StreamLanguage.define(dockerFile));
    },
  }),
  LanguageDescription.of({
    name: "CMake",
    filename: /(^|\/)cmakelists\.txt$/i,
    extensions: ["cmake"],
    load: async () => {
      const { cmake } = await import("@codemirror/legacy-modes/mode/cmake");
      return new LanguageSupport(StreamLanguage.define(cmake));
    },
  }),
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
  return (
    LanguageDescription.matchFilename(codeLanguages, path.toLowerCase()) ??
    LanguageDescription.matchLanguageName(
      codeLanguages,
      path.split(".").at(-1) ?? path,
      false,
    )
  );
}
