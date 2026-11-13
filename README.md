# OpenPluginHost

Le moteur de plugins partagé par [OpenCloudApp](https://github.com/Isno-Open/OpenCloudApp) et
[Winnza](https://github.com/Shad107/winnza). Extrait d'OpenCloudApp.

## Ce qu'il fait, et ce qu'il ne fait pas

**Partagé ici, le moteur seulement :**

- le format d'un plugin : `id`, titre, description, catégorie, icône, réglages déclarés, `register(api)` ;
- le chargement : plugins intégrés à l'application, copiés depuis un catalogue (`<dossier>/<id>/index.js`),
  ou modules de développement ;
- **un plugin en échec est écarté et signalé, il ne bloque jamais l'application** ;
- du code venu d'ailleurs n'est pas pris sur parole : chaque champ est vérifié, l'icône ne peut pas porter
  de balisage, l'identifiant doit être celui du dossier ;
- les réglages **déclarés** : le plugin décrit ses champs, l'application dessine l'écran, le plugin valide.
  Types : case, nombre, choix, texte, secret, couleur, image, et `json` pour un réglage structuré (liste,
  objet) que le plugin valide entièrement ;
- **l'écran de réglages** : le composant Svelte 5 `SettingsForm.svelte`, générique (voir plus bas) ;
- les plugins actifs : liste par défaut, plugins actifs d'office, catégories à choix unique.

**Ce qui reste dans chaque application, sous forme d'`api` :** ce que les plugins peuvent y apporter.
Le moteur ne connaît cette api que par son type paramètre.

| Application | Ce que son `api` contient |
|---|---|
| OpenCloudApp | modes de connexion, comptes, types d'appareils, thèmes |
| Winnza | sources de données, séries, collecteurs, dérivations |

L'application fournit aussi ses catégories et l'endroit où elle enregistre la liste des plugins actifs et
leurs réglages (fichier de configuration, base SQLite...).

## Utilisation

```ts
import { createPluginHost, type Plugin } from "@isno-open/plugin-host";

type Api = { declareSeries(id: string): void };
const CATEGORIES = ["data", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const host = createPluginHost<Api, Category>({
  builtins: { carburants: fuelPlugin },
  catalogDir: "/plugins",
  categories: CATEGORIES,
  defaultCategory: "other",
  makeApi: ({ id }) => ({ declareSeries: (s) => registry.add(id, s) }),
  storedSettings: (id) => db.pluginSettings(id),
});

const report = await host.load(["carburants"]);   // { loaded, failed }
```

## L'écran de réglages

```svelte
<script lang="ts">
  import SettingsForm from '@isno-open/plugin-host/svelte/SettingsForm.svelte';
  let { data } = $props();   // { fields, values } rendus par host.settingsForm(id)
  const save = async (values) => (await fetch(`/admin/plugins/${data.id}`, { method: 'POST', body: JSON.stringify(values) })).ok;
</script>

<SettingsForm fields={data.fields} values={data.values} lang="fr" onSave={save} />
```

L'application fournit l'enregistrement, et peut remplacer les textes (`text`) et le style : variables CSS
`--oph-*` et classes `oph-*`. Le composant n'importe rien de Node : il tourne dans le navigateur.

## Versions

Chaque application fige la version qu'elle utilise (étiquette git). Une évolution voulue par l'une ne
casse donc jamais l'autre : elle passe à la nouvelle version quand ses propres tests le permettent.

```json
"@isno-open/plugin-host": "github:Isno-Open/OpenPluginHost#v0.2.0"
```

## Développer

```sh
npm install
npm test
npm run check                 # types et composant Svelte
sh scripts/install-hooks.sh   # refuse tout commit qui contient un secret
```

## Licence

AGPL-3.0, comme OpenCloudApp et Winnza.
