/** Index Chinese characters and bigrams so partial queries work without a dictionary. */
export function tokenizeHelp(text) {
  return [
    ...new Set(
      (
        text.toLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? []
      ).flatMap((word) => {
        if (!/\p{Script=Han}/u.test(word)) return [word];
        const chars = [...word];
        return [
          ...chars,
          ...chars.slice(1).map((character, index) => chars[index] + character),
        ];
      }),
    ),
  ];
}
