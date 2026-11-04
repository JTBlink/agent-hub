import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const context = source("elements.js");
const picker = source("pick.js").replace("__ELEMENT_CONTEXT__", context);
const snapshot = (token) =>
  source("snapshot.js")
    .replace("__ELEMENT_CONTEXT__", context)
    .replace("__SNAPSHOT_ID__", token);
const reference = (ref, operation, value = null) =>
  source("reference.js")
    .replace("__ELEMENT_CONTEXT__", context)
    .replace("__OPERATION__", JSON.stringify(operation))
    .replace("__REFERENCE__", JSON.stringify(ref))
    .replace("__VALUE__", JSON.stringify(value));
const token = "0123456789abcdef0123456789abcdef";
function setup(html) {
  const page = new JSDOM(html, {
    url: "https://example.invalid/",
    runScripts: "outside-only",
  });
  const window = page.window;
  const geometry = (win) => {
    win.CSS = {
      escape: (value) => String(value).replace(/[^a-z0-9_-]/gi, "\\$&"),
    };
    win.Element.prototype.getBoundingClientRect = function () {
      return {
        x: 10,
        y: 20,
        width: this.closest("[hidden]") ? 0 : 100,
        height: 20,
      };
    };
    win.Element.prototype.scrollIntoView = () => {};
  };
  geometry(window);
  return { page, window, geometry };
}
it("describes accessible names and roles, traverses open shadow roots and same-origin frames, and omits hidden controls", () => {
  const { page, window, geometry } = setup(
    '<label for="name">Display name</label><input id="name"><button hidden>Hidden</button><fieldset disabled><input id="disabled"></fieldset><div id="host"></div><iframe></iframe>',
  );
  try {
    const shadow = window.document
      .querySelector("#host")
      .attachShadow({ mode: "open" });
    shadow.innerHTML = '<button aria-label="Save changes">Save</button>';
    const frame = window.document.querySelector("iframe");
    geometry(frame.contentWindow);
    frame.contentDocument.body.innerHTML = '<a href="/details">Details</a>';
    const result = window.eval(snapshot(token));
    expect(
      result.elements.find((item) => item.selector.includes("#name")),
    ).toMatchObject({ label: "Display name", role: "textbox" });
    expect(
      result.elements.find((item) => item.label === "Save changes"),
    ).toMatchObject({
      role: "button",
      selector: expect.stringContaining("::shadow"),
    });
    expect(
      result.elements.find((item) => item.text === "Details"),
    ).toMatchObject({
      role: "link",
      selector: expect.stringContaining("::frame"),
    });
    expect(result.elements.some((item) => item.text === "Hidden")).toBe(false);
    expect(
      result.elements.find((item) => item.selector.endsWith("#disabled"))
        .disabled,
    ).toBe(true);
  } finally {
    page.window.close();
  }
});
it("picks the deepest shadow element and preserves styles, hierarchy and page coordinates", () => {
  const { page, window } = setup('<div id="host"></div>');
  try {
    const host = window.document.querySelector("#host"),
      shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<button aria-label="Submit">Send</button>';
    window.document.elementFromPoint = () => host;
    shadow.elementFromPoint = () => shadow.querySelector("button");
    const result = window.eval(`(${picker})(50,30)`);
    expect(result).toMatchObject({
      role: "button",
      label: "Submit",
      domPath: expect.arrayContaining(["::shadow"]),
      documentBounds: { x: 10, y: 20, width: 100, height: 20 },
    });
    expect(result.styles).toHaveProperty("background-color");
  } finally {
    page.window.close();
  }
});
it("uses real value setters and input events, refuses readonly fields and stale same-URL SPA references", () => {
  const { page, window } = setup(
    '<label for="name">Name</label><input id="name"><input id="readonly" readonly><button id="button">Save</button>',
  );
  try {
    window.__agentHubNativePreview = { navigation: 0 };
    const state = window.eval(snapshot(token));
    const field = state.elements.find((item) =>
      item.selector.endsWith("#name"),
    );
    const input = window.document.querySelector("#name"),
      events = [];
    for (const name of ["input", "change"])
      input.addEventListener(name, () => events.push(name));
    window.eval(reference(field.ref, "fill", "__ELEMENT_CONTEXT__ literal"));
    expect(input.value).toBe("__ELEMENT_CONTEXT__ literal");
    expect(events).toEqual(["input", "change"]);
    const readonly = state.elements.find((item) =>
      item.selector.endsWith("#readonly"),
    );
    expect(() => window.eval(reference(readonly.ref, "fill", "value"))).toThrow(
      "not editable",
    );
    window.__agentHubNativePreview.navigation++;
    expect(() => window.eval(reference(field.ref, "inspect"))).toThrow(
      "Snapshot expired",
    );
  } finally {
    page.window.close();
  }
});
it("inspects disabled elements but refuses clicking covered or disabled controls", () => {
  const { page, window } = setup(
    '<button id="disabled" disabled>Disabled</button><button id="covered">Covered</button><div id="cover">Cover</div>',
  );
  try {
    const state = window.eval(snapshot(token)),
      disabled = state.elements.find((item) => item.label === "Disabled"),
      covered = state.elements.find((item) => item.label === "Covered");
    expect(window.eval(reference(disabled.ref, "inspect")).label).toBe(
      "Disabled",
    );
    expect(() => window.eval(reference(disabled.ref, "click"))).toThrow(
      "unavailable",
    );
    window.document.elementFromPoint = () =>
      window.document.querySelector("#cover");
    expect(() => window.eval(reference(covered.ref, "click"))).toThrow(
      "covered",
    );
  } finally {
    page.window.close();
  }
});
it("intercepts native selection before site handlers, keeps bounded console events, and invalidates SPA selections", () => {
  const { page, window } = setup(
    '<button id="target" aria-label="Choose item">Choose</button>',
  );
  try {
    const button = window.document.querySelector("button");
    window.document.elementFromPoint = () => button;
    window.console.debug = () => {};
    const bridge = readFileSync(
      new URL("../../../commands/preview_native/bridge.js", import.meta.url),
      "utf8",
    )
      .replace("__PICK_FUNCTION__", picker)
      .replace("__ELEMENT_CONTEXT__", context);
    window.eval(bridge);
    let siteActions = 0;
    button.addEventListener("mousedown", () => siteActions++);
    button.addEventListener("click", () => siteActions++);
    window.__agentHubNativePreview.enable(true);
    button.dispatchEvent(
      new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 30,
        view: window,
      }),
    );
    button.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 25,
        clientY: 30,
        view: window,
      }),
    );
    expect(siteActions).toBe(0);
    expect(window.__agentHubNativePreview.captured.value.label).toBe(
      "Choose item",
    );
    expect(window.__agentHubNativePreview.picking).toBe(false);
    for (let index = 0; index < 200; index++)
      window.console.debug("Entry " + index);
    expect(window.__agentHubNativePreview.events).toHaveLength(150);
    expect(window.__agentHubNativePreview.events.at(-1)).toMatchObject({
      method: "Runtime.consoleAPICalled",
      params: { type: "debug" },
    });
    window.eval(snapshot(token));
    window.history.pushState({}, "", window.location.href);
    expect(window.__agentHubNativePreview.navigation).toBe(1);
    expect(window.__agentHubNativePreview.captured).toBeNull();
    expect(window.__agentHubSnapshots.size).toBe(0);
  } finally {
    page.window.close();
  }
});
