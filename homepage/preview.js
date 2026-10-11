document.querySelector(".preview-controls").hidden = false;

const controls = document.querySelectorAll("[data-preview]");
const previews = document.querySelectorAll(".product-preview");

for (const control of controls) {
  control.addEventListener("click", () => {
    for (const button of controls) {
      const selected = button === control;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    for (const preview of previews) {
      preview.hidden = preview.id !== `preview-${control.dataset.preview}`;
    }
  });
}
