<script lang="ts">
  // Écran de réglages d'un plugin, générique : le cadre est le même pour tous, seul le contenu varie, et
  // il vient de ce que le plugin DÉCLARE (champs, bornes, libellés). Extrait d'OpenCloudApp.
  //
  // L'application fournit : les textes (`text`, par défaut ceux du moteur), l'enregistrement (`onSave`,
  // qui rend vrai si c'est accepté), et éventuellement `onChange` (aperçu en direct). Le style passe par
  // des variables CSS --oph-* et des classes oph-*, que l'application redéfinit à sa charte.
  //
  // N'importe que des modules sans dépendance Node : ce composant tourne dans le navigateur.
  import { SETTING_KIND, TEXT_FORMAT, IMAGE_TYPES, IMAGE_MAX_CHARS, ICON_MIN_PX, type LocalizedText, type SettingField, type SettingValue } from '../dist/contract.js';
  import { SETTINGS_FORM_TEXT, type SettingsFormText } from '../dist/form-text.js';

  interface Props {
    fields: readonly SettingField[];
    values: Record<string, SettingValue>;
    lang: keyof LocalizedText;
    text?: SettingsFormText;
    onSave: (values: Record<string, SettingValue>) => Promise<boolean>;
    onChange?: (values: Record<string, SettingValue>) => void;
    /** préfixe des identifiants HTML, si plusieurs formulaires cohabitent */
    idPrefix?: string;
  }
  const { fields, values, lang, text, onSave, onChange, idPrefix = 'oph' }: Props = $props();
  const s = $derived(text ?? SETTINGS_FORM_TEXT[lang]);

  const STATUS = { idle: 'idle', pending: 'pending', ok: 'ok', err: 'err' } as const;
  type Status = (typeof STATUS)[keyof typeof STATUS];

  // copie modifiable des valeurs reçues, prise une fois au montage (la saisie ne doit pas être écrasée)
  const initial = (): Record<string, SettingValue> => ({ ...values });
  let form = $state<Record<string, SettingValue>>(initial());
  let status = $state<Status>(STATUS.idle);
  let revealed = $state<Record<string, boolean>>({});
  let copied = $state<Record<string, boolean>>({});
  let imageError = $state<Record<string, boolean>>({});
  let jsonError = $state<Record<string, boolean>>({});
  const id = (f: SettingField): string => `${idPrefix}-${f.key}`;

  // un champ « sous » une case n'est actif que si la case est cochée
  const blocked = (f: SettingField): boolean => !!f.under && form[f.under] !== true;

  $effect(() => { if (onChange) onChange(JSON.parse(JSON.stringify(form)) as Record<string, SettingValue>); });

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    // un JSON invalide est signalé avant l'envoi ; le plugin revalide de toute façon à l'enregistrement
    let invalid = false;
    for (const f of fields) if (f.kind === SETTING_KIND.json) {
      try { JSON.parse(String(form[f.key] ?? '')); jsonError[f.key] = false; } catch { jsonError[f.key] = true; invalid = true; }
    }
    if (invalid) { status = STATUS.err; return; }
    status = STATUS.pending;
    const out: Record<string, SettingValue> = {};
    for (const f of fields) {
      if (f.kind === SETTING_KIND.secret) continue;   // montré, jamais renvoyé
      const v = form[f.key];
      if (v !== undefined) out[f.key] = f.kind === SETTING_KIND.number ? Number(v) : v;
    }
    try { status = (await onSave(out)) ? STATUS.ok : STATUS.err; } catch { status = STATUS.err; }
  }

  // image : lue dans le navigateur en data: URL, vérifiée comme le fera le plugin (type, taille, et pour
  // une icône : carrée et assez grande)
  const isImageType = (t: string): boolean => IMAGE_TYPES.some((x) => x === t);
  const readDataUrl = (file: File): Promise<string> => new Promise((done, fail) => {
    const r = new FileReader();
    r.onload = () => { if (typeof r.result === 'string') done(r.result); else fail(new Error('lecture')); };
    r.onerror = () => fail(r.error ?? new Error('lecture'));
    r.readAsDataURL(file);
  });
  const imageSize = (src: string): Promise<{ w: number; h: number }> => new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => fail(new Error('image'));
    img.src = src;
  });
  async function pickImage(f: SettingField & { kind: typeof SETTING_KIND.image }, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    imageError[f.key] = false;
    try {
      if (!isImageType(file.type)) throw new Error('type');
      const src = await readDataUrl(file);
      if (src.length > IMAGE_MAX_CHARS) throw new Error('taille');
      if (f.square && file.type !== 'image/svg+xml') {
        const { w, h } = await imageSize(src);
        if (w !== h || w < ICON_MIN_PX) throw new Error('forme');
      }
      form[f.key] = src;
    } catch { imageError[f.key] = true; }
  }

  async function copy(f: SettingField): Promise<void> {
    try { await navigator.clipboard.writeText(String(form[f.key] ?? '')); copied[f.key] = true; }
    catch { revealed[f.key] = true; }
  }
</script>

<form class="oph-form" onsubmit={save}>
  {#each fields as f (f.key)}
    <div class={['oph-field', { 'oph-under': !!f.under }]}>
      {#if f.kind === SETTING_KIND.toggle}
        <label class="oph-check"><input type="checkbox" id={id(f)} disabled={blocked(f)}
          checked={form[f.key] === true} onchange={(e) => { form[f.key] = e.currentTarget.checked; }} /> {f.label[lang]}</label>
      {:else}
        <label class="oph-label" for={id(f)}>{f.label[lang]}</label>
        {#if f.kind === SETTING_KIND.number}
          <input id={id(f)} type="number" min={f.min} max={f.max} disabled={blocked(f)}
            value={String(form[f.key] ?? '')} oninput={(e) => { form[f.key] = e.currentTarget.value; }} />
        {:else if f.kind === SETTING_KIND.choice}
          <select id={id(f)} disabled={blocked(f)} onchange={(e) => { form[f.key] = e.currentTarget.value; }}>
            {#each f.options as o (o.value)}<option value={o.value} selected={o.value === form[f.key]}>{o.label[lang]}</option>{/each}
          </select>
        {:else if f.kind === SETTING_KIND.text}
          <input id={id(f)} type={f.format === TEXT_FORMAT.url ? 'url' : 'text'} maxlength={f.maxLength} placeholder={f.placeholder} spellcheck="false"
            disabled={blocked(f)} value={String(form[f.key] ?? '')} oninput={(e) => { form[f.key] = e.currentTarget.value; }} />
        {:else if f.kind === SETTING_KIND.secret}
          <div class="oph-row">
            <input id={id(f)} type={revealed[f.key] ? 'text' : 'password'} readonly spellcheck="false" value={String(form[f.key] ?? '')} />
            <button type="button" class="oph-btn" onclick={() => { revealed[f.key] = !revealed[f.key]; }}>{revealed[f.key] ? s.secretHide : s.secretShow}</button>
            <button type="button" class="oph-btn" onclick={() => copy(f)}>{copied[f.key] ? s.secretCopied : s.secretCopy}</button>
          </div>
        {:else if f.kind === SETTING_KIND.color}
          <div class="oph-row">
            <input id={id(f)} type="color" disabled={blocked(f)} value={String(form[f.key] || '#000000')} oninput={(e) => { form[f.key] = e.currentTarget.value; }} />
            <code>{form[f.key] || s.colorDefault}</code>
            {#if form[f.key]}<button type="button" class="oph-btn" onclick={() => { form[f.key] = ''; }}>{s.imageRemove}</button>{/if}
          </div>
        {:else if f.kind === SETTING_KIND.image}
          <div class="oph-row">
            {#if form[f.key]}<img class={['oph-preview', { 'oph-square': !!f.square }]} src={String(form[f.key])} alt="" />{:else}<span class="oph-hint">{s.imageNone}</span>{/if}
            <label class="oph-btn">{form[f.key] ? s.imageReplace : s.imageChoose}<input id={id(f)} type="file" accept={IMAGE_TYPES.join(',')} hidden disabled={blocked(f)}
              onchange={(e) => pickImage(f, e.currentTarget)} /></label>
            {#if form[f.key]}<button type="button" class="oph-btn" onclick={() => { form[f.key] = ''; }}>{s.imageRemove}</button>{/if}
          </div>
          {#if imageError[f.key]}<span class="oph-error" role="alert">{s.imageRefused}</span>{/if}
        {:else if f.kind === SETTING_KIND.json}
          <textarea id={id(f)} class="oph-json" rows={f.rows ?? 12} spellcheck="false" disabled={blocked(f)}
            aria-invalid={jsonError[f.key] ? 'true' : undefined}
            value={String(form[f.key] ?? '')} oninput={(e) => { form[f.key] = e.currentTarget.value; jsonError[f.key] = false; }}></textarea>
          {#if jsonError[f.key]}<span class="oph-error" role="alert">{s.jsonInvalid}</span>{/if}
        {/if}
      {/if}
      {#if f.hint}<span class="oph-hint">{f.hint[lang]}</span>{/if}
    </div>
  {/each}
  <div class="oph-actions">
    <span class="oph-status" role="status">{status === STATUS.ok ? s.saved : status === STATUS.err ? s.saveError : status === STATUS.pending ? s.saving : ''}</span>
    <button type="submit" class="oph-submit" disabled={status === STATUS.pending}>{s.save}</button>
  </div>
</form>

<style>
  .oph-form { display: flex; flex-direction: column; gap: var(--oph-gap, 18px); }
  .oph-field { display: flex; flex-direction: column; gap: 6px; }
  .oph-under { margin-left: 24px; }
  .oph-label { font-weight: 600; }
  .oph-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .oph-hint { font-size: 0.9em; color: var(--oph-muted, #5f6670); }
  .oph-error { font-size: 0.9em; color: var(--oph-danger, #b42318); }
  .oph-json { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 13px; line-height: 1.5; width: 100%; }
  .oph-preview { max-height: 64px; }
  .oph-square { width: 64px; height: 64px; object-fit: contain; }
  .oph-actions { display: flex; justify-content: flex-end; align-items: center; gap: 14px; }
  .oph-btn, .oph-submit { min-height: 44px; cursor: pointer; }
  input, select, textarea { min-height: 44px; padding: 8px 10px; border-radius: var(--oph-radius, 10px); border: 1px solid var(--oph-border, #cfd4dc); background: var(--oph-input, #fff); color: inherit; font: inherit; }
</style>
