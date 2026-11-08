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
      document.querySelector(".workbench")?.scrollIntoView({ block: "center" });
    });
  }
}
