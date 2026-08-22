import { useEffect, useState } from "react";

import { getAppInfo } from "../lib/backend";
import { APP_NAME, APP_TAGLINE } from "../lib/app-meta";

const plannedAreas = ["配置中心", "Skills 中心", "工作空间", "变更历史"];

export function App() {
  const [runtimeVersion, setRuntimeVersion] = useState<string>();

  useEffect(() => {
    void getAppInfo()
      .then(({ version }) => setRuntimeVersion(version))
      .catch(() => setRuntimeVersion(undefined));
  }, []);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="app-title">
        <p className="eyebrow">AI Agent Workspace Manager</p>
        <h1 id="app-title">{APP_NAME}</h1>
        <p className="tagline">{APP_TAGLINE}</p>
        <div className="status">
          工程骨架已就绪{runtimeVersion ? ` · v${runtimeVersion}` : ""}
        </div>
      </section>

      <section className="module-grid" aria-label="规划模块">
        {plannedAreas.map((area) => (
          <article className="module-card" key={area}>
            <span>{area}</span>
            <small>规划中</small>
          </article>
        ))}
      </section>
    </main>
  );
}
