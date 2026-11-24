/* The case and its genetics. A case is four blood types (mother, baby, two men) built so that
 * exactly one man could be the father. Phenotype → possible genotypes, Punnett squares and the
 * parentage test all read from here, so the wells, the data table and the genetics tab agree.
 *
 * ABO: I^A and I^B codominant, i recessive (alleles 'A', 'B', 'O'). Rh: D dominant over d. */
import { seeded } from '../lab.js';

export const WELLS = ['A', 'B', 'Rh'];
export const TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
export const ABO_GENO = { A: ['AA', 'AO'], B: ['BB', 'BO'], AB: ['AB'], O: ['OO'] };
export const RH_GENO = { '+': ['DD', 'Dd'], '-': ['dd'] };

export const aboOf = (g) => { const a = g.includes('A'), b = g.includes('B'); return a && b ? 'AB' : a ? 'A' : b ? 'B' : 'O'; };
export const rhOf = (g) => (g.includes('D') ? '+' : '-');
export const typeLabel = (t) => t.abo + (t.rh === '+' ? '+' : '−');
/** Does this blood carry the antigen the well's antiserum binds? (Rh = the D antigen.) */
export const hasAntigen = (t, well) => (well === 'Rh' ? t.rh === '+' : t.abo.includes(well));
const sortABO = (a, b) => [a, b].sort((x, y) => 'ABO'.indexOf(x) - 'ABO'.indexOf(y)).join('');
const sortRh = (a, b) => [a, b].sort((x, y) => (x === 'D' ? 0 : 1) - (y === 'D' ? 0 : 1)).join('');

/** Could mother m and man f have child c, over every genotype their types allow? */
export function canParent(m, f, c) {
  const can = (G, of, want) => G[m[want]].some((mg) => G[f[want]].some((fg) =>
    [...mg].some((x) => [...fg].some((y) => of(x + y) === c[want]))));
  const aboOk = can(ABO_GENO, aboOf, 'abo'), rhOk = can(RH_GENO, rhOf, 'rh');
  return { aboOk, rhOk, ok: aboOk && rhOk };
}

/** The genotypes a type allows, as 'AO|Dd'. */
export const genotypes = (t) => ABO_GENO[t.abo].flatMap((a) => RH_GENO[t.rh].map((r) => `${a}|${r}`));

/** Mother × man as two Punnett squares and the 16 combined outcomes. */
export function punnett(momG, manG) {
  const [ma, mr] = momG.split('|'), [da, dr] = manG.split('|');
  const abo = [...ma].map((m) => [...da].map((d) => sortABO(m, d)));
  const rh = [...mr].map((m) => [...dr].map((d) => sortRh(m, d)));
  const tally = {};
  abo.flat().forEach((a) => rh.flat().forEach((r) => {
    const k = typeLabel({ abo: aboOf(a), rh: rhOf(r) });
    tally[k] = (tally[k] || 0) + 1 / 16;
  }));
  return { ma, mr, da, dr, abo, rh, tally };
}

export const DEFAULT_CASE = {
  no: 472, father: 'man2',
  types: { mother: { abo: 'O', rh: '+' }, baby: { abo: 'B', rh: '+' }, man1: { abo: 'A', rh: '-' }, man2: { abo: 'AB', rh: '+' } },
};

/** A case from a number: alleles drawn at roughly US frequencies, the baby from one allele of
 *  each real parent, the other man any type that could not have fathered this baby. */
export function makeCase(no) {
  if (no === DEFAULT_CASE.no) return DEFAULT_CASE;
  const r = seeded(no * 7919);
  const pick = (items) => { let x = r() * items.reduce((s, i) => s + i[1], 0); for (const [v, w] of items) if ((x -= w) <= 0) return v; return items[0][0]; };
  const rA = () => pick([['A', 0.28], ['B', 0.08], ['O', 0.64]]), rD = () => pick([['D', 0.6], ['d', 0.4]]);
  const any = (a) => a[Math.floor(r() * a.length)];
  for (let tries = 0; tries < 500; tries++) {
    const mg = [rA(), rA()], fg = [rA(), rA()], mr = [rD(), rD()], fr = [rD(), rD()];
    const mother = { abo: aboOf(mg.join('')), rh: rhOf(mr.join('')) };
    const father = { abo: aboOf(fg.join('')), rh: rhOf(fr.join('')) };
    const baby = { abo: aboOf(any(mg) + any(fg)), rh: rhOf(any(mr) + any(fr)) };
    const others = [];
    ['A', 'B', 'AB', 'O'].forEach((abo) => ['+', '-'].forEach((rh) => { if (!canParent(mother, { abo, rh }, baby).ok) others.push({ abo, rh }); }));
    if (!others.length) continue;
    const other = any(others), slot = r() < 0.5 ? 'man1' : 'man2';
    return { no, father: slot, types: { mother, baby, man1: slot === 'man1' ? father : other, man2: slot === 'man2' ? father : other } };
  }
  return DEFAULT_CASE;
}
