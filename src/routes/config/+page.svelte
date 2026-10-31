<!--
  - Copyright (C) 2025 jsouthgb
  -
  - This file is part of gdluxx.
  -
  - gdluxx is free software; you can redistribute it and/or modify
  - it under the terms of the GNU General Public License version 2 (GPL-2.0),
  - as published by the Free Software Foundation.
  -->

<script lang="ts">
  import { onMount } from 'svelte';
  import { themeStore } from '$lib/themes/themeStore';
  import { ConfigEditor, Icon } from '$lib/components';
  import { Button, Info, PageLayout } from '$lib/components/ui';
  import {
    configFields, parseFormConfig, readConfigField, updateConfigField, fetchConfigContent, saveConfigContent,
    type ConfigField,
  } from '$lib/api/config-editor';

  const { data } = $props();
  let theme = $state<'light' | 'dark'>('light');
  let mode = $state<'form' | 'json'>('form');
  let content = $state('{}');
  let savedContent = $state('{}');
  let source = $state<'config' | 'example'>('example');
  let lastSavedISO = $state<string | undefined>();
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  const dirty = $derived(content !== savedContent || source === 'example');
  const loadError = $derived(data.success ? '' : (data.error ?? 'Failed to load configuration'));
  const formError = $derived.by(() => {
    try { parseFormConfig(content); return ''; }
    catch (err) { return err instanceof Error ? err.message : 'Invalid configuration'; }
  });

  $effect(() => {
    if (data.success) {
      // The example includes placeholder credentials and unrelated site settings.
      const loadedContent = data.source === 'example'
        ? '{\n  "extractor": {"base-directory": "./gallery-dl"}\n}' : data.content;
      content = loadedContent;
      savedContent = loadedContent;
      source = data.source === 'config' ? 'config' : 'example';
      lastSavedISO = data.mtimeISO;
    }
  });

  onMount(() => themeStore.isDark.subscribe((dark) => { theme = dark ? 'dark' : 'light'; }));

  function changeField(field: ConfigField, text: string) {
    try {
      content = updateConfigField(content, field, text);
      error = '';
      message = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid setting';
    }
  }

  async function saveConfig(value: string): Promise<{ message: string; content: string }> {
    if (busy) { throw new Error('A configuration request is already in progress.'); }
    busy = true;
    error = '';
    message = '';
    try {
      parseFormConfig(value);
      const result = await saveConfigContent(value);
      const persisted = typeof result.content === 'string' ? result.content : value;
      content = persisted;
      savedContent = persisted;
      source = 'config';
      lastSavedISO = new Date().toISOString();
      message = result.message ?? 'Configuration saved.';
      return { message, content: persisted };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save configuration';
      throw err;
    } finally { busy = false; }
  }

  async function saveForm(event: SubmitEvent) {
    event.preventDefault();
    try { await saveConfig(content); } catch { /* Error is shown above the form. */ }
  }

  async function reload() {
    if (dirty && !window.confirm('Discard unsaved configuration changes?')) { return; }
    busy = true;
    error = '';
    message = '';
    try {
      const result = await fetchConfigContent('/api/config');
      content = result.source === 'example' ? '{\n  "extractor": {"base-directory": "./gallery-dl"}\n}' : result.content;
      savedContent = content;
      source = result.source ?? 'config';
      lastSavedISO = result.mtimeISO;
      message = 'Configuration reloaded.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to reload configuration';
    } finally { busy = false; }
  }

  async function importConfig(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { return; }
    if (dirty && !window.confirm('Replace unsaved changes with the imported file?')) {
      input.value = '';
      return;
    }
    busy = true;
    error = '';
    message = '';
    try {
      const imported = await file.text();
      parseFormConfig(imported);
      content = imported;
      message = 'Configuration imported. Save configuration to apply it.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to import configuration';
    } finally {
      busy = false;
      input.value = '';
    }
  }
</script>

<PageLayout title="Configuration">
  {#snippet icon()}<Icon iconName="json" size={32} />{/snippet}
  {#if loadError}
    <Info variant="warning">{loadError}</Info>
  {:else}
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <Button variant={mode === 'form' ? 'primary' : 'outline-primary'} disabled={busy}
        onclick={() => (mode = 'form')}>Basic settings</Button>
      <Button variant={mode === 'json' ? 'primary' : 'outline-primary'} disabled={busy}
        onclick={() => (mode = 'json')}>Advanced JSON</Button>
      <Button disabled={busy} onclick={reload}>Reload</Button>
      <span class="text-sm" aria-live="polite">{busy ? 'Saving or loading…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
    </div>
    {#if source === 'example'}
      <Info class="mb-6">No configuration has been saved yet. Start with the settings below.
        Empty fields use gallery-dl defaults. No example credentials will be saved.</Info>
    {/if}
    {#if message}<div role="status" class="mb-4"><Info>{message}</Info></div>{/if}
    {#if error}<div role="alert" class="mb-4"><Info variant="warning">{error}</Info></div>{/if}
    {#if mode === 'form'}
      {#if formError}
        <Info variant="warning">{formError}</Info>
      {:else}
        <form onsubmit={saveForm}>
          <fieldset disabled={busy} class="grid gap-6 rounded-surface border p-6">
            <legend class="px-2 font-semibold">Download settings</legend>
            <p class="text-sm">General settings apply to all sites unless overridden.
              Other settings are preserved and can be edited in Advanced JSON.</p>
            {#each configFields as field (field.path.join('.'))}
              {@const id = field.path.join('-')}
              {@const current = readConfigField(content, field)}
              <div class="grid gap-2">
                <label for={id} class="font-medium">{field.label}</label>
                {#if field.kind === 'boolean'}
                  <select {id} disabled={!current.editable} value={current.text}
                    aria-describedby={`${id}-help`} class="rounded-control border bg-surface p-2"
                    onchange={(event) => changeField(field, event.currentTarget.value)}>
                    <option value="">Default / inherited</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                {:else}
                  <input {id} type={field.kind === 'number' ? 'number' : 'text'}
                    min={field.kind === 'number' ? 0 : undefined}
                    step={field.kind === 'number' ? 1 : undefined}
                    disabled={!current.editable} value={current.text}
                    placeholder="Default / inherited" aria-describedby={`${id}-help`}
                    class="rounded-control border bg-surface p-2"
                    onchange={(event) => changeField(field, event.currentTarget.value)} />
                {/if}
                <p id={`${id}-help`} class="text-sm">
                  {current.editable ? field.description : 'This setting uses an advanced value. Edit it in Advanced JSON.'}
                </p>
              </div>
            {/each}
            <div><Button type="submit" variant="primary" disabled={!dirty || busy}
              loading={busy}>Save configuration</Button></div>
          </fieldset>
        </form>
      {/if}
    {:else}
      <label class="mb-4 block">
        Import JSON (not saved until you click Save)
        <input type="file" accept=".json,application/json" disabled={busy} onchange={importConfig}
          class="mt-2 block" />
      </label>
      <ConfigEditor bind:value={content} {theme} onSave={saveConfig} readonly={busy}
        height="65vh" {source} enableSourceBadge {lastSavedISO} />
    {/if}
  {/if}
</PageLayout>
