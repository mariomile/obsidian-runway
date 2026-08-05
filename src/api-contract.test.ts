import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contratto dell'API cross-plugin — la superficie che ALTRI repo consumano.
 *
 * Horizon chiama `app.plugins.plugins.runway.api.openForDay(day)` ridichiarando
 * il tipo inline al call site (`horizon/src/main.ts:155`). È guardato con un
 * null-check, quindi un rename qui non fa crashare Horizon: lo fa degradare in
 * SILENZIO, mostrando "Runway is not active" mentre Runway è perfettamente
 * attivo. Un guasto indistinguibile da uno stato legittimo, che nessun test di
 * Horizon può vedere perché il suo codice resta corretto.
 *
 * Questo test è l'unico posto in cui quel rename diventa rumoroso, e sta nel
 * repo giusto: chi rompe il contratto è chi lo possiede.
 *
 * ⚠️ Se questo test diventa rosso, la domanda non è "come lo faccio passare"
 * ma "chi altro devo aggiornare": la risposta è nel commento di ogni membro.
 */

const api = readFileSync(join(import.meta.dirname, 'api.ts'), 'utf8');

/** Membri pubblici e chi li consuma. Aggiungere qui quando nasce un consumer. */
const CONSUMED: ReadonlyArray<{ member: string; consumer: string }> = [
  { member: 'openForDay', consumer: 'obsidian-horizon (src/main.ts, apertura del giorno dalla Daybar)' },
];

test('l\'interfaccia RunwayApi dichiara i membri che altri plugin consumano', () => {
  for (const { member, consumer } of CONSUMED) {
    assert.match(
      api,
      new RegExp(`\\b${member}\\s*\\(`),
      `RunwayApi non dichiara più \`${member}\`, ma è consumato da ${consumer}. ` +
        `Un rename qui degrada quel consumer in silenzio — aggiornalo prima di procedere.`,
    );
  }
});

test('l\'API resta raggiungibile come `plugin.api` (il percorso che i consumer usano)', () => {
  const main = readFileSync(join(import.meta.dirname, 'main.ts'), 'utf8');
  assert.match(
    main,
    /this\.api\s*=/,
    'main.ts non assegna più `this.api`: i consumer risolvono `plugins.runway.api` e otterrebbero undefined.',
  );
});
