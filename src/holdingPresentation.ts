/** Presentation only: reference codes remain unchanged in commands and secondary details. */
export function readableCode(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLocaleLowerCase()
    .replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

/** Keeps long audit references out of primary business labels without inventing a holding name. */
export function carbonLabel(code: string): string {
  return `Carbon holding · ${code.slice(-8)}`;
}
