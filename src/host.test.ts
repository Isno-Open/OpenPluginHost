import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SETTING_KIND, type Plugin } from "./contract.js";
import { createPluginHost, asIcon } from "./host.js";
import { enabledIn, withPluginOff, withPluginOn } from "./enabled.js";

// Une application d'essai : son api compte ce que les plugins enregistrent, et sait à qui elle parle.
const CAT = ["login", "app", "other"] as const;
type Cat = (typeof CAT)[number];
type Api = { add: (what: string) => void; who: string };

function app(builtins: Record<string, Plugin<Api, Cat>>, extra: { catalogDir?: string; devModules?: string[] } = {}) {
  const added: string[] = [];
  const logs: string[] = [];
  const stored: Record<string, unknown> = { reglable: { seuil: 7 } };
  const host = createPluginHost<Api, Cat>({
    builtins, categories: CAT, defaultCategory: "other", exclusive: ["login"],
    makeApi: ({ id }) => ({ add: (w) => added.push(`${id}:${w}`), who: id }),
    storedSettings: (id) => stored[id], log: (m) => logs.push(m), ...extra,
  });
  return { host, added, logs };
}

const plugin = (id: string, more: Partial<Plugin<Api, Cat>> = {}): Plugin<Api, Cat> =>
  ({ id, title: { fr: id, en: id }, register: (api) => api.add("ok"), ...more });

test("charge les plugins actifs avec l'api de l'application, une seule fois", async () => {
  const { host, added } = app({ a: plugin("a"), b: plugin("b", { category: "app" }) });
  const r = await host.load(["a", "b"]);
  assert.deepEqual(r, { loaded: ["a", "b"], failed: [] });
  assert.deepEqual(added, ["a:ok", "b:ok"], "chaque plugin reçoit une api liée à lui");
  await host.load(["a", "b"]);
  assert.equal(host.installed().length, 2, "rappeler load n'installe rien en double");
  assert.deepEqual(host.installed().map((p) => [p.id, p.category, p.builtin]), [["a", "other", true], ["b", "app", true]]);
});

test("un plugin en échec est écarté et signalé, sans bloquer les autres", async () => {
  const { host, logs } = app({ casse: plugin("casse", { register: () => { throw new Error("boum"); } }), sain: plugin("sain") });
  const r = await host.load(["casse", "sain", "../evasion"]);
  assert.deepEqual(r.loaded, ["sain"]);
  assert.deepEqual(r.failed.map((f) => [f.id, f.error]), [["casse", "boum"], ["../evasion", "identifiant invalide"]]);
  assert.equal(logs.length, 2);
});

test("catalogue : module vérifié, identifiant égal au dossier, catégorie inconnue ignorée", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oph-"));
  const write = (id: string, src: string) => { mkdirSync(join(dir, id)); writeFileSync(join(dir, id, "index.js"), src); };
  write("bon", `export default { id: "bon", title: "Bon", category: "inventee", icon: { glyph: "★" }, register(api) { api.add(api.who); } };`);
  write("menteur", `export default { id: "autre", title: "x", register() {} };`);
  write("vide", `export const rien = 1;`);
  const { host, added } = app({}, { catalogDir: dir });
  const r = await host.load(["bon", "menteur", "vide"]);
  assert.deepEqual(r.loaded, ["bon"]);
  assert.deepEqual(r.failed.map((f) => f.id), ["menteur", "vide"]);
  assert.deepEqual(added, ["bon:bon"]);
  const info = host.installed()[0]!;
  assert.deepEqual([info.title.fr, info.title.en, info.category, info.builtin], ["Bon", "Bon", "other", false]);
  assert.deepEqual(info.icon, { glyph: "★" });
});

test("réglages déclarés : écran depuis l'enregistré, validation par le plugin, intégré inactif réglable", async () => {
  const reglable = plugin("reglable", {
    settings: {
      fields: [{ key: "seuil", kind: SETTING_KIND.number, min: 0, max: 10, label: { fr: "Seuil", en: "Threshold" } }],
      toForm: (s) => ({ seuil: (s as { seuil?: number } | undefined)?.seuil ?? 5 }),
      fromForm: (i) => { const n = Number(i.seuil); if (!(n >= 0 && n <= 10)) throw new Error("hors bornes"); return { seuil: n }; },
    },
  });
  const { host } = app({ reglable });
  assert.deepEqual(host.settingsForm("reglable")?.values, { seuil: 7 }, "réglable avant même d'être chargé");
  assert.deepEqual(host.settingsFromForm("reglable", { seuil: "3" }), { seuil: 3 });
  assert.throws(() => host.settingsFromForm("reglable", { seuil: "99" }), /hors bornes/);
  assert.equal(host.settingsForm("inconnu"), null);
});

test("catégorie à choix unique : en activer une éteint l'autre, pas le reste", async () => {
  const { host } = app({ mdp: plugin("mdp", { category: "login" }), sso: plugin("sso", { category: "login" }), pwa: plugin("pwa", { category: "app" }) });
  const rules = { defaults: ["mdp"], alwaysOn: [] };
  const on = await host.withPluginOnExclusive({ plugins: ["mdp", "pwa"] }, "sso", rules);
  assert.deepEqual(on.turnedOff, ["mdp"]);
  assert.deepEqual(enabledIn(on.state, rules), ["pwa", "sso"]);
});

test("actifs d'office : présents sans être listés, seul un retrait explicite les éteint", () => {
  const rules = { defaults: ["a"], alwaysOn: ["base"] };
  assert.deepEqual(enabledIn(null, rules), ["a", "base"]);
  const off = withPluginOff({ plugins: ["a"] }, "base", rules);
  assert.deepEqual(enabledIn(off, rules), ["a"]);
  assert.deepEqual(enabledIn(withPluginOn(off, "base", rules), rules), ["a", "base"]);
});

test("icône : jamais de balisage ni d'image d'ailleurs", () => {
  assert.deepEqual(asIcon({ path: "M4 4h16v16H4z" }), { path: "M4 4h16v16H4z" });
  assert.equal(asIcon({ path: "<script>" }), null);
  assert.equal(asIcon({ src: "https://exemple.org/x.png" }), null);
  assert.equal(asIcon({ glyph: "trop long ici" }), null);
});

// Champs propres à l'application : ici un thème appliqué à l'activation (texte court), vérifié par elle.
type Extra = { appliesTheme?: string };
const extraOf = (raw: Readonly<Record<string, unknown>>): Extra =>
  typeof raw.appliesTheme === "string" && /^[a-z-]{1,30}$/.test(raw.appliesTheme) ? { appliesTheme: raw.appliesTheme } : {};

test("champs propres : vérifiés par l'application, jamais à la place des champs communs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oph-"));
  const write = (id: string, src: string) => { mkdirSync(join(dir, id)); writeFileSync(join(dir, id, "index.js"), src); };
  write("theme", `export default { id: "theme", title: "T", appliesTheme: "sombre", register() {} };`);
  write("louche", `export default { id: "louche", title: "L", appliesTheme: "<script>", register() {} };`);
  const added: string[] = [];
  const host = createPluginHost<Api, Cat, Extra>({
    builtins: { integre: { ...plugin("integre"), appliesTheme: "clair" } },
    catalogDir: dir, categories: CAT, defaultCategory: "other",
    makeApi: ({ id }) => ({ add: (w) => added.push(`${id}:${w}`), who: id }),
    storedSettings: () => undefined, log: () => {},
    // une application qui tenterait de remplacer l'identifiant ou register par ses champs propres
    extra: (raw) => ({ ...extraOf(raw), id: "pirate", register: () => { added.push("pirate"); } }) as Extra,
  });
  await host.load(["integre", "theme", "louche"]);
  assert.equal(host.plugin("integre")?.appliesTheme, "clair", "un intégré porte ses champs tels quels");
  assert.equal(host.plugin("theme")?.appliesTheme, "sombre", "un plugin du catalogue porte le champ vérifié");
  assert.equal(host.plugin("louche")?.appliesTheme, undefined, "un champ refusé par l'application est omis");
  assert.equal(host.plugin("theme")?.id, "theme", "les champs propres ne remplacent pas l'identifiant");
  assert.ok(!added.includes("pirate"), "ni register");
  assert.equal(host.plugin("absent"), null);
});

test("peek lit une déclaration sans enregistrer le plugin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "oph-"));
  mkdirSync(join(dir, "dormant"));
  writeFileSync(join(dir, "dormant", "index.js"),
    `export default { id: "dormant", title: "D", category: "app", appliesTheme: "nuit", register(api) { api.add("reveil"); } };`);
  mkdirSync(join(dir, "menteur"));
  writeFileSync(join(dir, "menteur", "index.js"), `export default { id: "autre", title: "x", register() {} };`);
  const added: string[] = [];
  const host = createPluginHost<Api, Cat, Extra>({
    builtins: {}, catalogDir: dir, categories: CAT, defaultCategory: "other",
    makeApi: ({ id }) => ({ add: (w) => added.push(`${id}:${w}`), who: id }),
    storedSettings: () => undefined, log: () => {}, extra: extraOf,
  });
  const p = await host.peek("dormant");
  assert.deepEqual([p?.category, p?.appliesTheme], ["app", "nuit"]);
  assert.deepEqual(added, [], "rien n'est enregistré");
  assert.equal(host.installed().length, 0);
  assert.equal(await host.peek("menteur"), null, "un module qui ment sur son identifiant est refusé");
  assert.equal(await host.peek("../evasion"), null);
  assert.equal(await host.categoryOf("dormant"), "app");
});
