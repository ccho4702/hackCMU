export const SCRIPT_STYLES = [
  { value: "presentation", label: "Presentation", description: "Clear, structured, and easy to follow." },
  { value: "interview", label: "Interview", description: "Direct answers in a professional, conversational tone." },
  { value: "formal", label: "Formal", description: "Polished, respectful language for a professional audience." },
  { value: "informal", label: "Casual conversation", description: "Relaxed, natural everyday language." },
  { value: "friend", label: "With a friend", description: "Warm, personal, and easygoing." },
  { value: "pitch", label: "Pitch", description: "Concise and persuasive, focused on the main idea." },
];
export function scriptStyleLabel(value) {
  return SCRIPT_STYLES.find(option=>option.value===value)?.label || "Presentation";
}
