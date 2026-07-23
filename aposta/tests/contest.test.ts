import { expect, test } from 'vitest';
import { chooseContestLabel } from '../src/flow.js';

const MODAL_TEXT =
  'Existem 2 concursos abertos para a Lotofácil. Deseja incluir no carrinho qual concurso?';

test('chooseContestLabel picks the plain lottery name from the modal text', () => {
  expect(
    chooseContestLabel(MODAL_TEXT, ['Lotofácil da Independência', 'Lotofácil', 'Ambos']),
  ).toBe('Lotofácil');
});

test('chooseContestLabel falls back to the shortest non-Ambos label', () => {
  expect(
    chooseContestLabel('texto irreconhecível', ['Mega-Sena da Virada', 'Mega-Sena', 'Ambos']),
  ).toBe('Mega-Sena');
});

test('chooseContestLabel never returns Ambos even when it is shortest', () => {
  expect(chooseContestLabel('texto irreconhecível', ['Lotofácil da Independência', 'Ambos'])).toBe(
    'Lotofácil da Independência',
  );
});

test('chooseContestLabel returns null when only Ambos/empty labels exist', () => {
  expect(chooseContestLabel(MODAL_TEXT, ['Ambos', '  '])).toBeNull();
  expect(chooseContestLabel(MODAL_TEXT, [])).toBeNull();
});
