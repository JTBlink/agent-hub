const controls = [...document.querySelectorAll("[data-preview]")];
const previews = document.querySelectorAll(".product-preview");
const controlGroup = document.querySelector(".preview-controls");

if (controlGroup && controls.length) {
  controlGroup.hidden = false;
  function selectPreview(control) {
    for (const button of controls) {
      const selected = button === control;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const preview of previews) {
      preview.hidden = preview.id !== `preview-${control.dataset.preview}`;
    }
  }
  for (const control of controls) {
    control.addEventListener("click", () => selectPreview(control));
  }
  for (const shortcut of document.querySelectorAll("[data-show-preview]")) {
    shortcut.addEventListener("click", () => {
      const control = controls.find(
        (button) => button.dataset.preview === shortcut.dataset.showPreview,
      );
      if (!control) return;
      selectPreview(control);
      control.focus({ preventScroll: true });
      document.querySelector(".workbench")?.scrollIntoView({ block: "start" });
    });
  }
}

const viewer = document.querySelector(".screenshot-viewer");
if (typeof viewer?.showModal === "function") {
  const title = viewer.querySelector("#screenshot-title");
  const image = viewer.querySelector("img");
  const original = viewer.querySelector(".screenshot-original");

  for (const trigger of document.querySelectorAll("[data-screenshot]")) {
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      title.textContent = trigger.dataset.screenshot;
      original.href = trigger.href;
      image.alt = trigger.querySelector("img").alt;
      image.src = trigger.href;
      viewer.showModal();
    });
  }
}
