// Le moteur : charge les plugins (intégrés à l'application, copiés depuis un catalogue, ou modules de
// développement), leur donne l'`api` que l'application fabrique, et garde leurs fiches et réglages.
//
// Règle héritée d'OpenCloudApp : un plugin qui échoue au chargement est écarté et signalé, il ne bloque
// JAMAIS l'application. Et du code venu d'ailleurs n'est pas pris sur parole : chaque champ est vérifié.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PLUGIN_ID_RE, type Icon, type LocalizedText, type Plugin, type PluginInfo, type PluginSettings, type SettingValue } from "./contract.js";
import { enabledIn, withPluginOff, withPluginOn, type EnabledRules, type EnabledState } from "./enabled.js";

export type HostOptions<Api, Category extends string, Extra extends object = {}> = {
  /** plugins livrés avec l'application, par identifiant */
  builtins: Readonly<Record<string, Plugin<Api, Category, Extra>>>;
  /** dossier des plugins copiés depuis un catalogue : <dossier>/<id>/index.js */
  catalogDir?: string;
  /** modules chargés en plus, pour le développement d'un plugin (chemins ou URL) */
  devModules?: readonly string[];
  /** catégories reconnues par l'application, celle par défaut, et celles à choix unique */
  categories: readonly Category[];
  defaultCategory: Category;
  exclusive?: readonly Category[];
  /** l'api donnée à UN plugin : l'application y met ce qu'elle sait faire (et peut la lier au plugin) */
  makeApi: (plugin: { id: string }) => Api;
  /** réglages enregistrés d'un plugin (ce que son `toForm` relira) */
  storedSettings: (id: string) => unknown;
  /** champs propres à l'application, lus dans la déclaration brute d'un plugin venu d'ailleurs et
   *  VÉRIFIÉS ici (ce qui ne passe pas est omis, ou lève une erreur pour écarter le plugin). Sans cette
   *  option, un plugin du catalogue n'en porte aucun. Les intégrés, typés, les portent tels quels. */
  extra?: (raw: Readonly<Record<string, unknown>>, id: string) => Extra;
  /** où signaler un plugin écarté */
  log?: (message: string) => void;
};

export type LoadReport = { loaded: string[]; failed: { id: string; error: string }[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object";
const isText = (v: unknown): v is LocalizedText => isObj(v) && typeof v.fr === "string" && typeof v.en === "string";
const isSettings = (v: unknown): v is PluginSettings =>
  isObj(v) && Array.isArray(v.fields) && typeof v.toForm === "function" && typeof v.fromForm === "function";

/** Icône vérifiée : un caractère court, un tracé SVG fait de commandes et de nombres, ou une image en data: URL. */
export function asIcon(v: unknown): Icon | null {
  if (!isObj(v)) return null;
  if (typeof v.glyph === "string" && [...v.glyph].length >= 1 && [...v.glyph].length <= 4) return { glyph: v.glyph };
  if (typeof v.path === "string" && v.path.length <= 4000 && /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]+$/.test(v.path)) return { path: v.path };
  if (typeof v.src === "string" && /^data:image\/(png|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v.src) && v.src.length <= 140_000) return { src: v.src };
  return null;
}

export function createPluginHost<Api, Category extends string, Extra extends object = {}>(opts: HostOptions<Api, Category, Extra>) {
  const log = opts.log ?? ((m: string) => console.error(m));
  const isCategory = (v: unknown): v is Category => opts.categories.some((c) => c === v);
  const installed: PluginInfo<Category>[] = [];
  const loadedById = new Map<string, Plugin<Api, Category, Extra>>();
  const settingsById = new Map<string, PluginSettings>();
  let loading: Promise<LoadReport> | null = null;

  /** Un module chargé a-t-il la forme d'un plugin ? (export par défaut, ou exports nommés) */
  function asPlugin(m: Obj, fallbackId: string): Plugin<Api, Category, Extra> {
    const c = isObj(m.default) ? m.default : m;
    const register = c.register;
    if (typeof register !== "function") throw new Error("pas de register(api)");
    const icon = asIcon(c.icon);
    const id = typeof c.id === "string" ? c.id : fallbackId;
    // les champs propres viennent EN PREMIER : ils ne peuvent pas remplacer les champs communs vérifiés
    const extra = (opts.extra ? opts.extra(c, id) : {}) as Extra;
    return {
      ...extra,
      id,
      title: isText(c.title) ? c.title : typeof c.title === "string" ? { fr: c.title, en: c.title } : { fr: fallbackId, en: fallbackId },
      ...(isText(c.description) ? { description: c.description } : {}),
      ...(isSettings(c.settings) ? { settings: c.settings } : {}),
      ...(isCategory(c.category) ? { category: c.category } : {}),
      ...(icon ? { icon } : {}),
      register: (api: Api) => register.call(c, api),
    };
  }

  async function importCatalogPlugin(id: string): Promise<Plugin<Api, Category, Extra>> {
    if (!opts.catalogDir) throw new Error("aucun dossier de catalogue configuré");
    return asPlugin((await import(/* @vite-ignore */ pathToFileURL(join(opts.catalogDir, id, "index.js")).href)) as Obj, id);
  }

  const infoOf = (p: Plugin<Api, Category, Extra>, builtin: boolean): PluginInfo<Category> => {
    const icon = asIcon(p.icon);
    return { id: p.id, title: p.title, ...(p.description ? { description: p.description } : {}), ...(icon ? { icon } : {}),
      category: p.category ?? opts.defaultCategory, builtin, configurable: !!p.settings };
  };

  async function registerOne(p: Plugin<Api, Category, Extra>, builtin: boolean): Promise<void> {
    await p.register(opts.makeApi({ id: p.id }));
    installed.push(infoOf(p, builtin));
    loadedById.set(p.id, p);
    if (p.settings) settingsById.set(p.id, p.settings);
  }

  /** Charge les plugins actifs, une seule fois. Un plugin en échec est écarté et signalé. */
  function load(enabled: readonly string[]): Promise<LoadReport> {
    loading ??= (async () => {
      const report: LoadReport = { loaded: [], failed: [] };
      const fail = (id: string, e: unknown) => {
        const error = e instanceof Error ? e.message : String(e);
        report.failed.push({ id, error });
        log(`[plugins] ${id} non chargé : ${error}`);
      };
      for (const id of enabled) {
        try {
          const builtin = opts.builtins[id];
          if (builtin) { await registerOne(builtin, true); report.loaded.push(id); continue; }
          if (!PLUGIN_ID_RE.test(id)) throw new Error("identifiant invalide");
          const p = await importCatalogPlugin(id);
          if (p.id !== id) throw new Error(`le module se déclare « ${p.id} »`);
          await registerOne(p, false);
          report.loaded.push(id);
        } catch (e) { fail(id, e); }
      }
      for (const mod of opts.devModules ?? []) {
        try {
          const p = asPlugin((await import(/* @vite-ignore */ mod)) as Obj, mod);
          await registerOne(p, false);
          report.loaded.push(p.id);
        } catch (e) { fail(mod, e); }
      }
      return report;
    })();
    return loading;
  }

  /** Réglages d'un plugin : ceux du plugin chargé, sinon ceux d'un intégré inactif (on peut préparer
   *  ses réglages avant de l'activer). */
  const settingsOf = (id: string): PluginSettings | undefined => settingsById.get(id) ?? opts.builtins[id]?.settings;

  /** Déclaration d'un plugin (chargé, intégré ou copié depuis le catalogue), SANS l'enregistrer : ce
   *  qu'il déclarerait s'il était activé (catégorie, champs propres). null : introuvable ou invalide. */
  async function peek(id: string): Promise<Plugin<Api, Category, Extra> | null> {
    const known = loadedById.get(id) ?? opts.builtins[id];
    if (known) return known;
    if (!PLUGIN_ID_RE.test(id) || !opts.catalogDir) return null;
    try {
      const p = await importCatalogPlugin(id);
      return p.id === id ? p : null;
    } catch { return null; }
  }

  /** Catégorie d'un plugin (chargé, intégré ou copié depuis le catalogue), sans l'enregistrer. */
  async function categoryOf(id: string): Promise<Category> {
    return (await peek(id))?.category ?? opts.defaultCategory;
  }

  return {
    load,
    installed: (): readonly PluginInfo<Category>[] => installed,
    /** le plugin chargé, champs propres compris (null : pas chargé) */
    plugin: (id: string): Plugin<Api, Category, Extra> | null => loadedById.get(id) ?? null,
    peek,
    /** fiche d'un intégré, chargé ou non */
    builtinInfo: (id: string): PluginInfo<Category> | null => { const p = opts.builtins[id]; return p ? infoOf(p, true) : null; },
    /** champs et valeurs courantes de l'écran de réglages (null : pas de réglages) */
    settingsForm(id: string): { fields: PluginSettings["fields"]; values: Record<string, SettingValue>; previewable: boolean } | null {
      const s = settingsOf(id);
      return s ? { fields: s.fields, values: s.toForm(opts.storedSettings(id)), previewable: typeof s.preview === "function" } : null;
    },
    /** valeur validée par le plugin, prête à enregistrer (null : plugin absent ou sans réglages) */
    settingsFromForm(id: string, input: Record<string, unknown>): unknown {
      const s = settingsOf(id);
      return s ? s.fromForm(input) : null;
    },
    /** rendu en direct (non vérifié : l'application vérifie ce qu'elle reçoit), ou null */
    settingsPreview(id: string, input: Record<string, unknown>): unknown {
      const s = settingsOf(id);
      if (!s?.preview) return null;
      try { return s.preview(input); } catch { return null; }
    },
    categoryOf,
    /** état avec `id` activé, et les autres plugins actifs de sa catégorie éteints si elle est à choix
     *  unique. Rend aussi ceux qui ont été éteints, pour le dire. */
    async withPluginOnExclusive<S extends EnabledState>(state: S, id: string, rules: EnabledRules): Promise<{ state: S; turnedOff: string[] }> {
      const cat = await categoryOf(id);
      let out = withPluginOn(state, id, rules);
      const turnedOff: string[] = [];
      if ((opts.exclusive ?? []).includes(cat)) {
        for (const other of enabledIn(out, rules)) {
          if (other === id) continue;
          if ((await categoryOf(other)) === cat) { out = withPluginOff(out, other, rules); turnedOff.push(other); }
        }
      }
      return { state: out, turnedOff };
    },
  };
}

export type PluginHost<Api, Category extends string, Extra extends object = {}> = ReturnType<typeof createPluginHost<Api, Category, Extra>>;
