import { addDaysIso } from '../core/dates';
import type { Clock } from '../core/clock';
import { newId } from '../core/ids';
import i18n from '../i18n/i18n';
import { DEMO_PHOTOS, demoPhotoKey } from './demoPhotos';
import { saveImage } from './media/mediaStore';
import type { Repos } from './repositories';
import { SLOTS } from '../domain/models';

type Effort = 'quick' | 'normal' | 'elaborate';
/** [German name, English name, German tags, English tags, effort, photo in assets/demo-photos/ (no metadata)] */
type DemoDish = [string, string, string[], string[], Effort, string | null];

// 0–5 are planned for the coming days, 3 is the unconfirmed one from yesterday.
const DEMO: DemoDish[] = [
  ['Kürbissuppe', 'Pumpkin soup', ['vegetarisch', 'Suppe'], ['vegetarian', 'soup'], 'quick', 'Kürbissuppe'],
  ['Fisch mit Bratkartoffeln', 'Fish with fried potatoes', ['Fisch'], ['fish'], 'normal', 'Fisch mit Bratkartoffeln'],
  ['Pfannkuchen', 'Pancakes', ['Kinder', 'süß'], ['kids', 'sweet'], 'quick', 'Pfannkuchen'],
  ['Burger mit Pommes', 'Burger and fries', ['Fleisch', 'Kinder'], ['meat', 'kids'], 'normal', 'Burger mit Pommes'],
  ['Spargel mit Kartoffeln', 'Asparagus with potatoes', ['vegetarisch', 'Frühling'], ['vegetarian', 'spring'], 'normal', 'Spargel'],
  ['Entenkeule mit Rotkohl', 'Duck leg with red cabbage', ['Fleisch', 'Sonntag'], ['meat', 'Sunday'], 'elaborate', 'Entenkeule mit Rotkohl'],
  ['Shrimps mit Knoblauch', 'Garlic prawns', ['Fisch', 'schnell'], ['fish', 'quick'], 'quick', 'Shrimps'],
  ['Currywurst mit Pommes', 'Currywurst and fries', ['Fleisch', 'schnell'], ['meat', 'quick'], 'quick', 'Currywurst Pommes'],
  ['Käseplatte', 'Cheese board', ['vegetarisch', 'Abendbrot'], ['vegetarian', 'supper'], 'quick', 'Käseplatte'],
  ['Spaghetti Bolognese', 'Spaghetti bolognese', ['Pasta', 'Kinder'], ['pasta', 'kids'], 'normal', null],
  ['Fisch vom Grill', 'Grilled fish', ['Fisch', 'Grillen'], ['fish', 'barbecue'], 'normal', 'Fisch vom Grill'],
  ['Belegte Brote', 'Sandwiches', ['schnell', 'Abendbrot'], ['quick', 'supper'], 'quick', 'Sandwich'],
  ['Lammfilet', 'Lamb fillet', ['Fleisch', 'Gäste'], ['meat', 'guests'], 'elaborate', 'Lammfilet'],
  ['Linsencurry', 'Lentil curry', ['vegetarisch'], ['vegetarian'], 'normal', null],
  ['Bruschetta', 'Bruschetta', ['vegetarisch', 'schnell'], ['vegetarian', 'quick'], 'quick', 'Bruschetta'],
  ['Leberkässemmel', 'Leberkäse roll', ['schnell'], ['quick'], 'quick', 'Leberkässemmel'],
  ['Lasagne', 'Lasagne', ['Pasta'], ['pasta'], 'elaborate', null],
];

/** A new dish with a photo, never cooked yet (first in "longest ago"). */
const NEVER_COOKED = 'Lammfilet';

/** Map demo photo keys to demo photo file names (without extension) */
const demoPhotoMapping: Record<string, string> = {
  'Kürbissuppe': 'Kürbissuppe',
  'Fisch mit Bratkartoffeln': 'Fisch mit Bratkartoffeln',
  'Pfannkuchen': 'Pfannkuchen',
  'Burger mit Pommes': 'Burger mit Pommes',
  'Spargel mit Kartoffeln': 'Spargel',
  'Entenkeule mit Rotkohl': 'Entenkeule mit Rotkohl',
  'Shrimps mit Knoblauch': 'Shrimps',
  'Currywurst Pommes': 'Currywurst Pommes',
  'Käseplatte': 'Käseplatte',
  'Spaghetti Bolognese': null,
  'Fisch vom Grill': 'Fisch vom Grill',
  'Sandwich': 'Sandwich',
  'Lammfilet': 'Lammfilet',
  'Linsencurry': null,
  'Bruschetta': 'Bruschetta',
  'Leberkässemmel': 'Leberkässemmel',
  'Lasagne': null,
};

/** Debug only: 17 dishes (14 with real photos) with ~3 months of history, in the app's language. */
export async function seedDemoData(repos: Repos, clock: Clock, tableId: string): Promise<void> {
  const de = i18n.language.startsWith('de');
  const today = clock.today();
  const ids: string[] = [];
  for (const [nameDe, nameEn, tagsDe, tagsEn, effort, photo] of DEMO) {
    const photoFile = demoPhotoMapping[photo];
    const photoPath = photoFile ? `assets/demo-photos/${photoFile}.jpg` : null;
    const url = photoFile ? await (await import('fs').then(f => f.promises.readFile(photoPath, 'buffer'))) : null;
    const id = await repos.dishes.create({ name: de ? nameDe : nameEn, tags: de ? tagsDe : tagsEn, effort, mealTypes: [] });
    ids.push(id);
    if (photo && photoFile) {
      // Save the local photo as the dish photo
      const blob = photo instanceof Blob ? photo : await (await import('fs').then(f => f.promises.readFile(photoPath)));
      const mediaId = newId();
      const img = await saveImage(tableId, mediaId, blob);
      await repos.media.add(id, 'dish_photo', img, mediaId);
    }
  }
  const byName = (name: string) => ids[DEMO.findIndex((d) => d[0] === name)];
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.floor((seed / 233280) * n);
  };
  // Older history: dishes with a photo (not the "never cooked" one), no dish twice in a row.
  const withPhoto = DEMO.map((d, i) => (d[5] && d[0] !== NEVER_COOKED ? i : -1)).filter((i) => i >= 0);
  let previous = -1;
  for (let i = 90; i >= 8; i--) {
    if (rand(3) === 0) continue;
    let pick = withPhoto[rand(withPhoto.length)];
    if (pick === previous) pick = withPhoto[(withPhoto.indexOf(pick) + 1) % withPhoto.length];
    previous = pick;
    const status = rand(8) === 0 ? 'skipped' : 'cooked';
    await repos.plan.add({ date: addDaysIso(today, -i), slot: 'dinner', dishId: ids[pick], status });
  }
  // Last week: the dishes without a photo were cooked recently (→ end of "longest ago" in the overview).
  const lastWeek = ['Spaghetti Bolognese', 'Fisch vom Grill', 'Linsencurry', 'Shrimps mit Knoblauch', 'Lasagne', 'Currywurst mit Pommes'];
  for (const [n, name] of lastWeek.entries()) {
    await repos.plan.add({ date: addDaysIso(today, n - 7), slot: 'dinner', dishId: byName(name), status: 'cooked' });
  }
  // Yesterday not confirmed yet ("Was it cooked?"), the coming days planned.
  await repos.plan.add({ date: addDaysIso(today, -1), slot: 'dinner', dishId: ids[3] });
  for (const [day, dish] of [[0, 0], [1, 1], [2, 2], [4, 4], [5, 5]] as const) {
    await repos.plan.add({ date: addDaysIso(today, day), slot: SLOTS[1], dishId: ids[dish] });
  }
  await repos.plan.add({ date: addDaysIso(today, 3), slot: SLOTS[1], title: de ? 'Reste' : 'Leftovers' });
  // A few votes (stars) – one person in the demo, so the average is "mine".
  for (const [name, stars] of [
    ['Entenkeule mit Rotkohl', 5], ['Pfannkuchen', 5], ['Kürbissuppe', 4], ['Burger mit Pommes', 4],
    ['Spargel mit Kartoffeln', 5], ['Fisch mit Bratkartoffeln', 3], ['Käseplatte', 4], ['Lasagne', 5],
  ] as const) {
    await repos.votes.set(byName(name), stars);
  }
  // Two wishes ("mal wieder essen").
  await repos.wishes.add(byName('Käseplatte'));
  await repos.wishes.add(byName('Bruschetta'));
}