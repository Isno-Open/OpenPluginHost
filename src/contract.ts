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

/** Nature d'un réglage, donc du contrôle dessiné par l'application. `json` : un réglage structuré (une
 *  liste, un objet) saisi en JSON, que le plugin valide entièrement dans son `fromForm`. `multi` :
 *  plusieurs choix cochés parmi des options (valeur = la liste des valeurs cochées, dans l'ordre des
 *  options). */
export const SETTING_KIND = { toggle: "toggle", number: "number", choice: "choice", multi: "multi", text: "text", secret: "secret", color: "color", image: "image", json: "json" } as const;
export type SettingKind = (typeof SETTING_KIND)[keyof typeof SETTING_KIND];

/** Forme d'un réglage texte : libre, ou adresse web (le navigateur aide à la saisie ; le plugin valide). */
export const TEXT_FORMAT = { plain: "plain", url: "url" } as const;
export type TextFormat = (typeof TEXT_FORMAT)[keyof typeof TEXT_FORMAT];

export type SettingOption = { value: string; label: LocalizedText };
type FieldBase = { key: string; label: LocalizedText; hint?: LocalizedText; under?: string };   // under : case dont il dépend
export type SettingField =
  | (FieldBase & { kind: typeof SETTING_KIND.toggle })
  | (FieldBase & { kind: typeof SETTING_KIND.number; min: number; max: number })
  | (FieldBase & { kind: typeof SETTING_KIND.choice; options: readonly SettingOption[] })
  | (FieldBase & { kind: typeof SETTING_KIND.multi; options: readonly SettingOption[] })
  | (FieldBase & { kind: typeof SETTING_KIND.text; format: TextFormat; maxLength: number; placeholder?: string })
  // secret : valeur créée et gardée par le plugin, MONTRÉE (masquée, à copier) mais jamais saisie ni renvoyée
  | (FieldBase & { kind: typeof SETTING_KIND.secret })
  | (FieldBase & { kind: typeof SETTING_KIND.color })
  | (FieldBase & { kind: typeof SETTING_KIND.image; square?: boolean })
  // json : texte JSON (valeur du formulaire = le texte) ; rows : hauteur de la zone de saisie
  | (FieldBase & { kind: typeof SETTING_KIND.json; rows?: number });
export type SettingValue = boolean | number | string | readonly string[];

/** Taille maximale d'une image (logo, icône) en data: URL : environ 100 Ko de fichier. */
export const IMAGE_MAX_CHARS = 140_000;
/** Types d'image acceptés. */
export const IMAGE_TYPES = ["image/png", "image/webp", "image/svg+xml"] as const;
/** Plus petite icône acceptée (côté, en pixels) : en dessous, floue sur un écran d'accueil. */
export const ICON_MIN_PX = 48;

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

/** Un plugin. `Api` : ce que l'application lui donne ; `Category` : les catégories qu'elle reconnaît ;
 *  `Extra` : les champs propres à l'application (ex. le thème qu'un plugin applique à son activation),
 *  que l'application vérifie elle-même (option `extra` de l'hôte). */
export type Plugin<Api, Category extends string = string, Extra extends object = {}> = PluginBase<Api, Category> & Extra;

/** Ce que tout plugin déclare, quelle que soit l'application. */
export type PluginBase<Api, Category extends string = string> = {
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
