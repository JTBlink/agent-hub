import type { Terminal } from "@xterm/xterm";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invertLinkDestination, openWebLink } from "../../lib/openWebLink";
/** Unmodified clicks remain available to selection and terminal mouse protocols. */
export function bindTerminalWebLinks(
  terminal: Terminal,
  onError: (error: unknown) => void,
) {
  let disposed = false;
  let pressed: string | undefined;
  const activate = (event: MouseEvent, address: string) => {
    if (
      disposed ||
      pressed !== address ||
      event.button !== 0 ||
      !(event.metaKey || event.ctrlKey)
    )
      return;
    event.preventDefault();
    void openWebLink(address, { invert: invertLinkDestination(event) }).catch(
      onError,
    );
  };
  let hovered: string | undefined;
  const hover = (_event: MouseEvent, uri: string) => {
    hovered = uri;
  };
  const leave = () => {
    hovered = undefined;
  };
  const down = (event: MouseEvent) => {
    pressed = undefined;
    if (hovered && event.button === 0 && (event.metaKey || event.ctrlKey)) {
      pressed = hovered;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const up = (event: MouseEvent) => {
    const address = pressed;
    if (!address) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (hovered === address) activate(event, address);
    pressed = undefined;
  };
  const element = terminal.element;
  element?.addEventListener("mousedown", down, true);
  element?.addEventListener("mouseup", up, true);
  const previous = terminal.options.linkHandler;
  terminal.options.linkHandler = {
    activate,
    hover,
    leave,
    allowNonHttpProtocols: false,
  };
  const addon = new WebLinksAddon(activate, { hover, leave });
  terminal.loadAddon(addon);
  return () => {
    disposed = true;
    element?.removeEventListener("mousedown", down, true);
    element?.removeEventListener("mouseup", up, true);
    addon.dispose();
    terminal.options.linkHandler = previous;
  };
}
