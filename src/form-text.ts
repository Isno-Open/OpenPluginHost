// Textes de l'écran de réglages, dans les langues du contrat. Une application peut les remplacer ;
// le composant n'écrit aucun texte en dur.
import type { LocalizedText } from "./contract.js";

export type SettingsFormText = {
  save: string; saving: string; saved: string; saveError: string;
  secretShow: string; secretHide: string; secretCopy: string; secretCopied: string;
  colorDefault: string; imageNone: string; imageChoose: string; imageReplace: string; imageRemove: string; imageRefused: string;
  jsonInvalid: string;
};

export const SETTINGS_FORM_TEXT: Record<keyof LocalizedText, SettingsFormText> = {
  fr: {
    save: "Enregistrer", saving: "Enregistrement…", saved: "Enregistré.", saveError: "Enregistrement refusé.",
    secretShow: "Afficher", secretHide: "Masquer", secretCopy: "Copier", secretCopied: "Copié",
    colorDefault: "par défaut", imageNone: "Aucune image", imageChoose: "Choisir une image", imageReplace: "Remplacer", imageRemove: "Retirer",
    imageRefused: "Image refusée : PNG, WebP ou SVG, assez petite (et carrée pour une icône).",
    jsonInvalid: "Ce n'est pas du JSON valide.",
  },
  en: {
    save: "Save", saving: "Saving…", saved: "Saved.", saveError: "Save refused.",
    secretShow: "Show", secretHide: "Hide", secretCopy: "Copy", secretCopied: "Copied",
    colorDefault: "default", imageNone: "No image", imageChoose: "Choose an image", imageReplace: "Replace", imageRemove: "Remove",
    imageRefused: "Image refused: PNG, WebP or SVG, small enough (and square for an icon).",
    jsonInvalid: "This is not valid JSON.",
  },
};
