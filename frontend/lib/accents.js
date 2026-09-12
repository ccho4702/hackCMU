export const ACCENTS = [
  { value: "original", label: "Original accent" },
  { value: "american", label: "American English" },
  { value: "british", label: "British English" },
  { value: "indian", label: "Indian English" },
  { value: "australian", label: "Australian English" },
];
export function accentLabel(value) {
  return ACCENTS.find(option => option.value === value)?.label || "Original accent";
}
