import { toString } from "mdast-util-to-string";

export function remarkReadingTime() {
  return function (tree, vFile) {
    const text = toString(tree);
    const words = text.split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    if (!vFile.data.fm) vFile.data.fm = {};
    vFile.data.fm.readingTime = minutes;
  };
}
