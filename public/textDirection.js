// Decide whether a string reads right-to-left, by majority script: more RTL
// characters (Hebrew, Arabic, Syriac) than Latin letters. Used to set a note's
// text direction and to localize generated text such as the "Copy of" prefix.
export function isRtlText(text) {
  const t = text || "";
  const rtl = (t.match(/[֐-׿؀-ۿ܀-ݏ]/g) || []).length;
  const ltr = (t.match(/[A-Za-z]/g) || []).length;
  return rtl > ltr;
}
