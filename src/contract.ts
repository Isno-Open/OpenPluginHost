// Contrat d'un plugin, commun à toutes les applications qui embarquent OpenPluginHost.
//
// Extrait d'OpenCloudApp (Isno-Open). Ce fichier n'a AUCUNE dépendance : un plugin peut l'importer à
// l'exécution (vocabulaire des réglages) sans tirer le reste du moteur.
//
// Ce qui est générique vit ici. Ce qui est propre à une application (comptes et boîtiers pour
// OpenCloudApp, sources de données pour Winnza) vit dans l'application, sous forme d'extensions de
// l'`api` que chaque plugin reçoit : le moteur ne la connaît que par son type paramètre `Api`.

/** Texte dans les langues de l'interface. */
export type LocalizedText = { fr: string; en: string };

/** Icône d'une carte de plugin : un caractère, un tracé SVG 24×24 dessiné au trait, ou une petite image
 *  (data: URL). Jamais de balisage : un plugin ne peut pas injecter de HTML. */
export type Icon = { glyph: string } | { path: string } | { src: string };

/** Nature d'un réglage, donc du contrôle dessiné par l'application. */
export const SETTING_KIND = { toggle: "toggle", number: "number", choice: "choice", text: "text", secret: "secret", color: "color", image: "image" } as const;
export type SettingKind = (typeof SETTING_KIND)[keyof typeof SETTING_KIND];

/** Forme d'un réglage texte : libre, ou adresse web (le navigateur aide à la saisie ; le plugin valide). */
export const TEXT_FORMAT = { plain: "plain", url: "url" } as const;
export type TextFormat = (typeof TEXT_FORMAT)[keyof typeof TEXT_FORMAT];

type FieldBase = { key: string; label: LocalizedText; hint?: LocalizedText; under?: string };   // under : case dont il dépend
export type SettingField =
  | (FieldBase & { kind: typeof SETTING_KIND.toggle })
  | (FieldBase & { kind: typeof SETTING_KIND.number; min: number; max: number })
  | (FieldBase & { kind: typeof SETTING_KIND.choice; options: readonly { value: string; label: LocalizedText }[] })
  | (FieldBase & { kind: typeof SETTING_KIND.text; format: TextFormat; maxLength: number; placeholder?: string })
  // secret : valeur créée et gardée par le plugin, MONTRÉE (masquée, à copier) mais jamais saisie ni renvoyée
  | (FieldBase & { kind: typeof SETTING_KIND.secret })
  | (FieldBase & { kind: typeof SETTING_KIND.color })
  | (FieldBase & { kind: typeof SETTING_KIND.image; square?: boolean });
export type SettingValue = boolean | number | string;

/** Réglages d'un plugin : il les DÉCLARE, l'application dessine l'écran (même cadre pour tous) et le
 *  plugin valide. Un plugin n'a donc pas à livrer d'interface. */
export type PluginSettings = {
  fields: readonly SettingField[];
  /** valeurs affichées, depuis ce qui est enregistré */
  toForm(stored: unknown): Record<string, SettingValue>;
  /** valeur à enregistrer, bornée par le plugin (lève une erreur si la saisie est invalide) */
  fromForm(input: Record<string, unknown>): unknown;
  /** facultatif : rendu en direct de valeurs non enregistrées (ex. un thème) ; l'application le vérifie */
  preview?(input: Record<string, unknown>): unknown;
};

/** Un plugin. `Api` : ce que l'application lui donne ; `Category` : les catégories qu'elle reconnaît. */
export type Plugin<Api, Category extends string = string> = {
  /** identifiant, égal au nom de son dossier : PLUGIN_ID_RE */
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  category?: Category;
  icon?: Icon;
  settings?: PluginSettings;
  /** appelée une fois au chargement ; c'est là que le plugin apporte ce qu'il fait */
  register(api: Api): void | Promise<void>;
};

/** Fiche d'un plugin chargé, pour l'écran d'administration. */
export type PluginInfo<Category extends string = string> = {
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  icon?: Icon;
  category: Category;
  builtin: boolean;
  configurable: boolean;
};

/** Identifiant de plugin = nom de dossier. */
export const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
