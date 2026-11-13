// Quels plugins sont actifs. Fonctions pures sur la liste enregistrée par l'application : où elle est
// stockée (fichier de config, base) ne regarde pas le moteur.

/** Ce que l'application enregistre : les plugins activés, et ceux, actifs d'office, qu'on a éteints. */
export type EnabledState = { plugins?: readonly string[]; pluginsOff?: readonly string[] };

export type EnabledRules = {
  /** actifs quand rien n'est encore enregistré */
  defaults: readonly string[];
  /** actifs d'office, même sur une instance déjà configurée : seul un retrait explicite les éteint */
  alwaysOn: readonly string[];
};

/** Plugins actifs selon l'état enregistré : sa liste (ou celle par défaut), plus les plugins actifs
 *  d'office qu'il n'a pas éteints. */
export function enabledIn(state: EnabledState | null, rules: EnabledRules): string[] {
  const list = state?.plugins ?? rules.defaults;
  const off = state?.pluginsOff ?? [];
  return [...list, ...rules.alwaysOn.filter((id) => !list.includes(id) && !off.includes(id))];
}

/** État avec `id` activé : ajouté à la liste, retiré des éteints. */
export function withPluginOn<S extends EnabledState>(state: S, id: string, rules: EnabledRules): S {
  // la liste ne nomme pas les plugins actifs d'office : ils le sont sans y être
  const listed = enabledIn(state, rules).filter((x) => !rules.alwaysOn.includes(x));
  const plugins = rules.alwaysOn.includes(id) || listed.includes(id) ? listed : [...listed, id];
  return { ...state, plugins, pluginsOff: (state.pluginsOff ?? []).filter((x) => x !== id) };
}

/** État avec `id` désactivé : retiré de la liste ; un plugin actif d'office est noté comme éteint. */
export function withPluginOff<S extends EnabledState>(state: S, id: string, rules: EnabledRules): S {
  const off = state.pluginsOff ?? [];
  return {
    ...state,
    plugins: enabledIn(state, rules).filter((x) => x !== id && !rules.alwaysOn.includes(x)),
    pluginsOff: rules.alwaysOn.includes(id) && !off.includes(id) ? [...off, id] : off,
  };
}
