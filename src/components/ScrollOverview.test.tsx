// @vitest-environment jsdom
import { act, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScrollOverview } from "./ScrollOverview";
it("scrolls the actual viewport with keyboard, scaled track clicks and dragging", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let viewport: HTMLDivElement;
  function Fixture() {
    const scroll = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      viewport = scroll.current!;
      Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 100 },
        scrollHeight: { configurable: true, value: 1000 },
      });
      const rail = host.querySelector('[role="scrollbar"]')!;
      Object.defineProperty(rail, "clientHeight", {
        configurable: true,
        value: 300,
      });
      rail.getBoundingClientRect = () => new DOMRect(0, 50, 14, 360);
    }, []);
    return (
      <>
        <div id="overview-document" ref={scroll} />
        <ScrollOverview
          scrollRef={scroll}
          contentKey="demo"
          controls="overview-document"
          label="Document overview"
          marks={[{ top: 30, height: 2, kind: "added" }]}
        />
      </>
    );
  }
  await act(async () => root.render(<Fixture />));
  const rail = host.querySelector<HTMLElement>('[role="scrollbar"]')!;
  const key = async (key: string) =>
    act(async () => {
      rail.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  await key("End");
  expect(viewport!.scrollTop).toBe(900);
  await key("PageUp");
  expect(viewport!.scrollTop).toBe(800);
  await key("Home");
  expect(viewport!.scrollTop).toBe(0);
  const pointer = async (type: string, clientY: number) =>
    act(async () => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { clientY, pointerId: 7, button: 0 });
      rail.dispatchEvent(event);
    });
  await pointer("pointerdown", 230);
  expect(viewport!.scrollTop).toBeCloseTo(450);
  await pointer("pointermove", 410);
  expect(viewport!.scrollTop).toBe(900);
  await pointer("pointerup", 410);
  expect(rail.getAttribute("aria-valuenow")).toBe("900");
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
