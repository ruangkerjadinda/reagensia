/**
 * Pembangun form sederhana.
 *
 * Validasi dijalankan di sini untuk memberi umpan balik cepat, tapi bukan
 * sebagai penjaga terakhir — Apps Script memvalidasi ulang semuanya di sisi
 * server, karena aturan yang hanya hidup di browser gampang dilewati.
 */

import { el, toInputDate, fromInputDate } from './dom.js';

/**
 * @param {Array<{key,label,type,options,required,hint,value,min,max,step,readonly,placeholder,span}>} fields
 */
export function buildForm(fields, { onChange } = {}) {
  const controls = new Map();
  const errors = new Map();

  const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' } });

  for (const field of fields) {
    const id = `f-${field.key}`;
    let input;

    if (field.type === 'select') {
      input = el('select.select', { id, disabled: field.readonly },
        el('option', { value: '', text: field.placeholder || '— pilih —' }),
        ...(field.options || []).map((o) => {
          const value = typeof o === 'string' ? o : o.value;
          const label = typeof o === 'string' ? o : o.label;
          return el('option', { value, text: label, selected: String(field.value ?? '') === String(value) });
        }));
    } else if (field.type === 'group-select') {
      input = el('select.select', { id, disabled: field.readonly },
        el('option', { value: '', text: field.placeholder || '— pilih —' }),
        ...(field.groups || []).map((g) => el('optgroup', { label: g.label },
          ...g.options.map((o) => el('option', { value: o.value, text: o.label, selected: field.value === o.value })))));
    } else if (field.type === 'textarea') {
      input = el('textarea.textarea', { id, value: field.value ?? '', placeholder: field.placeholder || '', readOnly: field.readonly });
    } else if (field.type === 'date') {
      input = el('input.input', {
        id, type: 'date', readOnly: field.readonly,
        value: field.value instanceof Date ? toInputDate(field.value) : (field.value || ''),
      });
    } else if (field.type === 'number') {
      input = el('input.input', {
        id, type: 'number', inputMode: 'decimal', readOnly: field.readonly,
        value: field.value ?? '', min: field.min, max: field.max, step: field.step || 1,
        placeholder: field.placeholder || '',
      });
    } else {
      input = el('input.input', {
        id, type: 'text', readOnly: field.readonly,
        value: field.value ?? '', placeholder: field.placeholder || '',
      });
    }

    if (field.required) input.required = true;

    const errorEl = el('span.field-error', { hidden: true });
    const wrapper = el('div.field', {
      style: { gridColumn: field.span === 2 ? '1 / -1' : 'auto' },
    },
    el('label.field-label', { for: id, text: field.required ? `${field.label} *` : field.label }),
    input,
    field.hint ? el('span.field-hint', { text: field.hint }) : null,
    errorEl);

    input.addEventListener('input', () => {
      clearError(field.key);
      onChange?.(field.key, readOne(field, input), api);
    });
    input.addEventListener('change', () => {
      clearError(field.key);
      onChange?.(field.key, readOne(field, input), api);
    });

    controls.set(field.key, { field, input, errorEl, wrapper });
    grid.append(wrapper);
  }

  function readOne(field, input) {
    if (field.type === 'date') return fromInputDate(input.value);
    if (field.type === 'number') return input.value === '' ? null : Number(input.value);
    return input.value.trim();
  }

  function clearError(key) {
    const c = controls.get(key);
    if (!c) return;
    errors.delete(key);
    c.errorEl.hidden = true;
    c.input.removeAttribute('aria-invalid');
  }

  const api = {
    node: grid,

    values() {
      const out = {};
      for (const [key, { field, input }] of controls) out[key] = readOne(field, input);
      return out;
    },

    set(key, value) {
      const c = controls.get(key);
      if (!c) return;
      if (c.field.type === 'date') c.input.value = value instanceof Date ? toInputDate(value) : (value || '');
      else c.input.value = value == null ? '' : String(value);
      clearError(key);
    },

    setMax(key, max) {
      const c = controls.get(key);
      if (c) c.input.max = max;
    },

    setError(key, message) {
      const c = controls.get(key);
      if (!c) return;
      errors.set(key, message);
      c.errorEl.textContent = message;
      c.errorEl.hidden = false;
      c.input.setAttribute('aria-invalid', 'true');
    },

    focus(key) {
      controls.get(key)?.input.focus();
    },

    /** @returns {boolean} true kalau tidak ada galat */
    validate(extraRules = []) {
      for (const key of [...controls.keys()]) clearError(key);

      for (const [key, { field, input }] of controls) {
        const value = readOne(field, input);
        if (field.required && (value == null || value === '')) {
          api.setError(key, `${field.label} wajib diisi.`);
          continue;
        }
        if (field.type === 'number' && value != null) {
          if (field.min != null && value < field.min) api.setError(key, `Minimal ${field.min}.`);
          else if (input.max !== '' && input.max != null && value > Number(input.max)) {
            api.setError(key, `Maksimal ${input.max}.`);
          }
        }
      }

      for (const rule of extraRules) {
        const message = rule(api.values());
        if (message) api.setError(message.key, message.text);
      }

      if (errors.size) {
        api.focus([...errors.keys()][0]);
        return false;
      }
      return true;
    },

    disable(disabled) {
      for (const { input } of controls.values()) input.disabled = disabled || input.readOnly;
    },
  };

  return api;
}
