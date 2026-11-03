/** Native handles have their own namespace and never enter Chromium inventory. */
export const isNativePage = (id: string) => id.startsWith("preview-native-");
