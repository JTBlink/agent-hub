import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LanguageProvider } from "./LanguageProvider";
import { messages, useLanguage } from "./i18n";

function Probe() {
  const { language, t } = useLanguage();
  return (
    <span>
      {language}:{t("installationSummary")}
    </span>
  );
}

describe("language support", () => {
  it("provides a stable default locale during SSR", () => {
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    expect(markup).toContain("zh-CN:安装摘要");
    expect(messages["en-US"].installationSummary).toBe("Installation Summary");
    expect(messages["en-US"].agentsToInstall).toBe(
      "Which agents do you want to install to?",
    );
  });
});
