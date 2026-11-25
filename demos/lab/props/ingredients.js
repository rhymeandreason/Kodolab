import { toLinear } from '../materials.js';

/* Common ingredients, so every lab shows the same one the same way: a salt jar
 * is lilac with a purple label in every lab, baking soda is peach with orange.
 *
 *   makeJar(mat, { ingredient: 'salt' });
 *   makeJarLid(mat, { ingredient: 'salt' });    // lid in the label colour
 *
 * Add an ingredient here (not in a sim) the first time a lab needs it, and pick
 * a colour no other ingredient uses. Colours are as picked (sRGB hex); the
 * props convert them.
 *   title  label title, one or two lines
 *   line   the smaller line under it (formula, amount)
 *   label  label bands and lid
 *   body   jar plastic
 *   powder optional contents colour; white powder when absent
 */
export const INGREDIENTS = {
  bakingSoda: { title: ['Sodium', 'bicarbonate'], line: 'NaHCO₃  ·  500 g', label: '#ea580c', body: '#f6b07c' },
  yeast: { title: ['Active dry', 'yeast'], line: 'Saccharomyces  ·  113 g', label: '#7c4a21', body: '#d9bd6a', powder: '#c9a25a' },
  salt: { title: ['Table', 'salt'], line: 'NaCl  ·  sodium chloride', label: '#7c3aed', body: '#c9b8f0' },
};

/** The ingredient for a key, or throws so a typo doesn't silently give a blank jar. */
export function ingredient(key) {
  const it = INGREDIENTS[key];
  if (!it) throw new Error(`Unknown ingredient '${key}'. Add it to props/ingredients.js. Known: ${Object.keys(INGREDIENTS).join(', ')}`);
  return it;
}

/** A powder material in a picked sRGB hex (the same matte as mat.powder), for a jar's contents,
 *  a scoop's heap and powderFall. A copy; pass the result around rather than rebuilding it. */
export function powderMaterial(mat, hex) {
  return mat.make.solid(toLinear(hex), 1);
}
