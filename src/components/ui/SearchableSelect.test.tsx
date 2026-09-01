// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchableSelect } from './SearchableSelect';

afterEach(cleanup);

const options = [
  { value: 'e1', label: 'Adriana Molina · ID 1001', searchText: 'adriana molina 1001' },
  { value: 'e2', label: 'Bosch Noguera, Roberto · ID 2002', searchText: 'bosch noguera, roberto 2002' },
  { value: 'e3', label: 'Casero Bosquet, Ana · ID 3003', searchText: 'casero bosquet, ana 3003' },
];

function renderSelect(value = 'e1', onChange = vi.fn()) {
  render(
    <SearchableSelect
      label="Empleado:"
      value={value}
      options={options}
      onChange={onChange}
      searchPlaceholder="Buscar empleado…"
      emptyMessage="Sin resultados."
      ariaLabel="Empleado:"
    />,
  );
  return { onChange };
}

describe('SearchableSelect', () => {
  it('renders closed with the selected option label', () => {
    renderSelect('e2');
    expect(screen.getByText('Bosch Noguera, Roberto · ID 2002')).toBeTruthy();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens the panel on trigger click, showing all options', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters by name', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado…'), { target: { value: 'casero' } });
    const remaining = screen.getAllByRole('option');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('Casero Bosquet');
  });

  it('filters by external id', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado…'), { target: { value: '2002' } });
    const remaining = screen.getAllByRole('option');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].textContent).toContain('Bosch Noguera');
  });

  it('shows the empty message when the search matches nothing', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar empleado…'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('Sin resultados.')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('clicking an option calls onChange and closes the panel', () => {
    const { onChange } = renderSelect('e1');
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    fireEvent.click(screen.getByText('Casero Bosquet, Ana · ID 3003'));
    expect(onChange).toHaveBeenCalledWith('e3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ArrowDown + Enter selects the highlighted option', () => {
    const { onChange } = renderSelect('e1');
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const search = screen.getByPlaceholderText('Buscar empleado…');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('e3');
  });

  it('Escape closes the panel without changing the value', () => {
    const { onChange } = renderSelect('e1');
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const search = screen.getByPlaceholderText('Buscar empleado…');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the open menu renders in a body portal, outside any clipping ancestor', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: 'Empleado:' }));
    const menu = screen.getByRole('listbox').closest('.modal-select-menu');
    expect(menu).not.toBeNull();
    expect(menu!.parentElement).toBe(document.body);
  });
});
