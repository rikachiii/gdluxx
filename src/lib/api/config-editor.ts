/*
 * Copyright (C) 2025 jsouthgb
 *
 * This file is part of gdluxx.
 *
 * gdluxx is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 2 (GPL-2.0),
 * as published by the Free Software Foundation.
 */
import { modify, applyEdits } from 'jsonc-parser';


export interface ConfigContent {
  content: string;
  source?: 'config' | 'example';
  mtimeISO?: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function fetchConfigContent(endpoint: string): Promise<ConfigContent> {
  const response = await fetch(endpoint, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result: ApiEnvelope<ConfigContent> = await response.json();
  if (!result?.success || !result?.data?.content) {
    throw new Error(result?.error ?? 'Invalid response format from server');
  }

  return result.data;
}

export async function fetchExampleConfig(): Promise<string> {
  const response = await fetch('/config-example.json');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const content = await response.text();

  try {
    JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON format in example configuration');
  }

  return content;
}

/** Editable scalar fields for the guided configuration form. */
export interface ConfigField {
  path: string[];
  label: string;
  kind: 'string' | 'number' | 'boolean';
  description: string;
}

export const configFields: ConfigField[] = [
  { path: ['extractor', 'base-directory'], label: 'Download directory', kind: 'string',
    description: 'Server-side destination. Container paths are normalized when saved.' },
  { path: ['extractor', 'filename'], label: 'Filename template', kind: 'string',
    description: 'For example: {id}_{num}.{extension}. Available keywords depend on the site.' },
  { path: ['extractor', 'archive'], label: 'Download archive', kind: 'string',
    description: 'Archive database used to skip files already downloaded.' },
  { path: ['extractor', 'retries'], label: 'Request retries', kind: 'number',
    description: 'Number of retries after a failed request.' },
  { path: ['extractor', 'fanbox', 'comments'], label: 'FANBOX comments', kind: 'boolean',
    description: 'Include comment metadata when supported by the extractor.' },
  { path: ['extractor', 'fanbox', 'embeds'], label: 'FANBOX embedded content', kind: 'boolean',
    description: 'Follow supported embedded content.' },
  { path: ['extractor', 'fanbox', 'fee-max'], label: 'FANBOX maximum fee', kind: 'number',
    description: 'Maximum required plan fee for posts to process (JPY).' },
];

export function parseFormConfig(content: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('The configuration must be valid JSON. Fix it in Advanced JSON first.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The configuration must be a JSON object. Fix it in Advanced JSON first.');
  }
  return value as Record<string, unknown>;
}

export function readConfigField(content: string, field: ConfigField): {
  text: string; editable: boolean;
} {
  let value: unknown = parseFormConfig(content);
  for (const key of field.path) {
    if (value === undefined) {
      return { text: '', editable: true };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { text: '', editable: false };
    }
    value = (value as Record<string, unknown>)[key];
  }
  if (value === undefined) {
    return { text: '', editable: true };
  }
  const editable = typeof value === field.kind &&
    (field.kind !== 'number' || (Number.isSafeInteger(value) && Number(value) >= 0));
  return {
    text: editable ? String(value) : '',
    editable,
  };
}

export function updateConfigField(content: string, field: ConfigField, text: string): string {
  if (!readConfigField(content, field).editable) {
    throw new Error('This setting uses an advanced value. Edit it in Advanced JSON.');
  }
  let value: string | number | boolean | undefined;
  if (!text.trim()) {
    value = undefined;
  } else if (field.kind === 'number') {
    value = Number(text);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Enter a non-negative whole number.');
    }
  } else if (field.kind === 'boolean') {
    if (text !== 'true' && text !== 'false') {
      throw new Error('Choose Default, Enabled, or Disabled.');
    }
    value = text === 'true';
  } else {
    value = text;
  }
  const edits = modify(content, field.path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
  });
  return applyEdits(content, edits);
}

export interface ConfigSaveResult {
  success: boolean;
  message?: string;
  content?: string;
}

export async function saveConfigContent(content: string): Promise<ConfigSaveResult> {
  parseFormConfig(content);
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const result: ApiEnvelope<ConfigSaveResult> = await response.json();
  if (!response.ok || result.success !== true || result.data?.success !== true) {
    throw new Error(result.error ?? 'Failed to save configuration');
  }
  return result.data;
}
