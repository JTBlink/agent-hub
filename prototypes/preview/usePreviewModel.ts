import { useState, useEffect, useRef } from "react";
import {
  initialTabs,
  markdown,
  type Capture,
  type PreviewTab,
} from "./fixtures";
import { captureText, type Panel, type Variant } from "./previewFormat";
export function usePreviewModel() {
  const [variant, setVariant] = useState<Variant>(() => {
    const value = new URLSearchParams(location.search).get("variant");
    return value === "B" || value === "C" ? value : "A";
  });
  const [tabs, setTabs] = useState(initialTabs);
  const [closed, setClosed] = useState<PreviewTab[]>([]);
  const [activeId, setActiveId] = useState(1);
  const [address, setAddress] = useState(initialTabs[0].url);
  const [panel, setPanel] = useState<Panel>("feedback");
  const [panelOpen, setPanelOpen] = useState(true);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  } | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [source, setSource] = useState(false);
  const [sourceLine, setSourceLine] = useState<number | undefined>();
  const [mobile, setMobile] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [findMatches, setFindMatches] = useState(0);
  const [findIndex, setFindIndex] = useState(0);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "new" | "share" | "send" | "screenshot" | null
  >(null);
  const [dark, setDark] = useState(true);
  const [devtools, setDevtools] = useState(false);
  const [toolTab, setToolTab] = useState("Console");
  const [profiles, setProfiles] = useState(["开发环境", "访客会话"]);
  const [profileName, setProfileName] = useState("");
  const [remote, setRemote] = useState("本机");
  const [remoteHost, setRemoteHost] = useState("dev.example.invalid");
  const [renderOn, setRenderOn] = useState("本机渲染");
  const [linkRouting, setLinkRouting] = useState("模块内打开");
  const [agent, setAgent] = useState("Codex");
  const [prompt, setPrompt] = useState("");
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [automation, setAutomation] = useState("");
  const [downloads, setDownloads] = useState<
    { id: number; name: string; state: string }[]
  >([]);
  const [reloading, setReloading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [association, setAssociation] = useState("未关联项目");
  useEffect(() => {
    const root = document.documentElement;
    const original = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    return () => {
      root.classList.toggle("dark", original);
    };
  }, [dark]);
  const content = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cookieInput = useRef<HTMLInputElement>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const md =
    active?.kind === "markdown" ? (active.content ?? markdown) : markdown;
  const customHtml = active?.kind === "html" ? (active.content ?? null) : null;
  const pageCaptures = captures.filter(
    (item) => item.tabId === activeId && item.url === active?.url,
  );
  const current = pageCaptures.find((item) => item.id === selected);
  const notify = (message: string) => setToast(message);
  const switchVariant = (next: Variant) => {
    setVariant(next);
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
  };
  const cycleVariant = (delta: number) => {
    const keys: Variant[] = ["A", "B", "C"];
    switchVariant(keys[(keys.indexOf(variant) + delta + 3) % 3]);
  };
  const openPanel = (next: Panel) => {
    setPanel(next);
    setPanelOpen(true);
    setMenu(false);
  };
  const updateTab = (patch: Partial<PreviewTab>) =>
    setTabs((previous) =>
      previous.map((tab) => (tab.id === activeId ? { ...tab, ...patch } : tab)),
    );
  const setMd = (content: string) => updateTab({ content });
  const setCustomHtml = (content: string | null) =>
    updateTab({ content: content ?? undefined });
  const selectTab = (tab: PreviewTab) => {
    setActiveId(tab.id);
    setAddress(tab.url);
    setSource(false);
    setSourceLine(undefined);
    setPicking(false);
    setHover(null);
    setSelected(null);
    setQuery("");
    setFindMatches(0);
    setFindIndex(0);
  };
  const addTab = (
    kind: PreviewTab["kind"] = "web",
    url = "about:blank",
    title = "新标签页",
    content?: string,
  ) => {
    const id = Date.now();
    const tab = {
      id,
      kind,
      url,
      title,
      history: [url],
      cursor: 0,
      profile: active?.profile ?? "开发环境",
      content,
    };
    setTabs((previous) => [...previous, tab]);
    selectTab(tab);
    setModal(null);
  };
  const closeTab = (id: number) => {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;
    setClosed((previous) => [...previous, tab]);
    const next = tabs.filter((item) => item.id !== id);
    setTabs(next);
    if (id === activeId && next.length)
      selectTab(
        next[Math.max(0, tabs.findIndex((item) => item.id === id) - 1)],
      );
  };
  const restoreTab = (id: number) => {
    const tab = closed.find((item) => item.id === id);
    if (!tab) return;
    setTabs((previous) => [...previous, tab]);
    setClosed((previous) => previous.filter((item) => item.id !== id));
    selectTab(tab);
  };
  const reopen = () => {
    const tab = closed.at(-1);
    if (tab) restoreTab(tab.id);
  };
  const navigate = (value: string) => {
    if (!active) return;
    const url = /^(https?:|workspace:|about:)/.test(value)
      ? value
      : value.includes(".") || value.includes(":")
        ? `https://${value}`
        : `https://search.example.invalid/?q=${encodeURIComponent(value)}`;
    updateTab({
      url,
      history: [...active.history.slice(0, active.cursor + 1), url],
      cursor: active.cursor + 1,
      title: url.includes("localhost") ? "工作台概览" : "网页演示",
    });
    setAddress(url);
    setSelected(null);
    setPicking(false);
    setHover(null);
    notify("地址状态已更新；原型展示内置演示页，不请求外部网站");
  };
  const go = (delta: number) => {
    if (!active) return;
    const cursor = active.cursor + delta;
    if (cursor < 0 || cursor >= active.history.length) return;
    updateTab({ cursor, url: active.history[cursor] });
    setAddress(active.history[cursor]);
    setSelected(null);
    setPicking(false);
    setHover(null);
  };
  const reload = () => {
    setReloading(true);
    setPicking(false);
    setHover(null);
    window.setTimeout(() => setReloading(false), 450);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("已复制上下文");
    } catch {
      notify("浏览器未允许复制，请在上下文区手动选择复制");
    }
  };
  const grab = (element: HTMLElement, screenshot = false) => {
    if (!active || captures.length >= 20) {
      notify("原型最多保留 20 条批注，请先清理");
      return;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const id = Date.now();
    const item: Capture = {
      id,
      tabId: activeId,
      url: active.url,
      selector: element.id ? `#${element.id}` : element.tagName.toLowerCase(),
      text: (element.textContent ?? "").trim().slice(0, 600),
      html: element.outerHTML.slice(0, 1800),
      styles: `color: ${style.color};\nfont: ${style.font};\npadding: ${style.padding};\nborder-radius: ${style.borderRadius};`,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      note: "",
      screenshot,
      source:
        active.kind === "markdown" && element.dataset.sourceLine
          ? `${active.title}:${element.dataset.sourceLine}`
          : undefined,
    };
    setCaptures((previous) => [...previous, item]);
    setSelected(id);
    setPanel("feedback");
    setPanelOpen(true);
    setPicking(false);
    setHover(null);
    notify(
      screenshot
        ? "已添加截图示意与元素上下文"
        : "已选取，添加修改意见后交给 Agent",
    );
  };
  const downloadText = (name: string, text: string, type = "text/markdown") => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloads((previous) => [
      ...previous,
      { id: Date.now(), name, state: "已导出" },
    ]);
    notify("已触发浏览器文件下载");
  };
  const sendPreview = () => {
    setPrompt(captureText(pageCaptures));
    setModal("send");
  };
  const importFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      notify("原型文件上限为 4 MiB");
      return;
    }
    const text = await file.text();
    if (/\.(md|markdown)$/i.test(file.name)) {
      addTab(
        "markdown",
        `workspace:///imports/${encodeURIComponent(file.name)}`,
        file.name,
        text,
      );
    } else if (/\.html?$/i.test(file.name)) {
      addTab(
        "html",
        `workspace:///imports/${encodeURIComponent(file.name)}`,
        file.name,
        text,
      );
    } else notify("请选择 Markdown 或 HTML 文件");
  };
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof HTMLElement &&
        !!event.target.closest(
          "input,textarea,select,[role=combobox],[role=listbox],[role=option],[contenteditable=true]",
        );
      if (event.key === "Escape") {
        setPicking(false);
        setHover(null);
        setModal(null);
        setMenu(false);
        setFindOpen(false);
        return;
      }
      if (editing) return;
      if (event.key === "ArrowLeft") cycleVariant(-1);
      if (event.key === "ArrowRight") cycleVariant(1);
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          setFindOpen(true);
        }
        if (event.key.toLowerCase() === "t") {
          event.preventDefault();
          if (event.shiftKey) reopen();
          else addTab();
        }
      }
      if (
        picking &&
        hover &&
        (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "s")
      ) {
        const element = document
          .elementFromPoint(
            hover.x + hover.w / 2,
            hover.y + Math.min(hover.h / 2, 20),
          )
          ?.closest<HTMLElement>("[data-pick],h1,h2,h3,p,li,td,pre,blockquote");
        if (element) {
          event.preventDefault();
          if (event.key.toLowerCase() === "c") void copy(element.outerHTML);
          else grab(element, true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const changeQuery = (value: string) => {
    setQuery(value);
    setFindIndex(0);
    setFindMatches(
      value
        ? (content.current?.textContent ?? "")
            .toLocaleLowerCase()
            .split(value.toLocaleLowerCase()).length - 1
        : 0,
    );
  };

  return {
    variant,
    setVariant,
    tabs,
    setTabs,
    closed,
    setClosed,
    activeId,
    setActiveId,
    address,
    setAddress,
    panel,
    setPanel,
    panelOpen,
    setPanelOpen,
    picking,
    setPicking,
    hover,
    setHover,
    captures,
    setCaptures,
    selected,
    setSelected,
    source,
    sourceLine,
    setSourceLine,
    setSource,
    md,
    setMd,
    customHtml,
    setCustomHtml,
    mobile,
    setMobile,
    findOpen,
    setFindOpen,
    query,
    setQuery,
    findMatches,
    setFindMatches,
    findIndex,
    setFindIndex,
    toast,
    setToast,
    modal,
    setModal,
    dark,
    setDark,
    devtools,
    setDevtools,
    toolTab,
    setToolTab,
    profiles,
    setProfiles,
    profileName,
    setProfileName,
    remote,
    setRemote,
    remoteHost,
    setRemoteHost,
    renderOn,
    setRenderOn,
    linkRouting,
    setLinkRouting,
    agent,
    setAgent,
    prompt,
    setPrompt,
    agentLog,
    setAgentLog,
    automation,
    setAutomation,
    downloads,
    setDownloads,
    reloading,
    setReloading,
    menu,
    setMenu,
    association,
    setAssociation,
    content,
    stage,
    fileInput,
    cookieInput,
    active,
    current,
    pageCaptures,
    notify,
    switchVariant,
    cycleVariant,
    openPanel,
    updateTab,
    selectTab,
    addTab,
    closeTab,
    reopen,
    restoreTab,
    navigate,
    go,
    reload,
    copy,
    grab,
    downloadText,
    sendPreview,
    importFile,
    changeQuery,
  };
}
export type PreviewModel = ReturnType<typeof usePreviewModel>;
