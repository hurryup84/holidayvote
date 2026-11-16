import type { Repos } from './repositories';

/** Maps a demo house link to a local photo in assets/demo-photos/ (shown in screenshots). */
const housePhotos: Record<string, { title: string | null; site: string | null; photo: string }> = {
  'https://www.novasol.de/ferienhaus/beispiel-1': { title: 'Reetdachhaus mit Sauna', site: 'novasol.de', photo: 'schweden' },
  'https://www.airbnb.de/rooms/beispiel-2': { title: 'Strandvilla Seeblick', site: 'airbnb.de', photo: 'daenemark' },
  'https://www.fewo-direkt.de/ferienwohnung/beispiel-3': { title: 'Kapitänshaus am Bodden', site: 'fewo-direkt.de', photo: 'toscana' },
};

/** Demo vacation (debug page, screenshots). Links of real-looking pages; previews load live. */
export async function seedDemo(repos: Repos): Promise<string> {
  const id = await repos.vacations.create({
    name: 'Sommer an der Ostsee',
    destination: 'Rügen',
    startDate: '2027-07-10',
    endDate: '2027-07-24',
    description: '2 Familien, 4 Erwachsene, 3 Kinder. Gern mit Garten und nah am Strand.',
  });
  const houses = [
    { url: 'https://www.novasol.de/ferienhaus/beispiel-1', title: 'Reetdachhaus mit Sauna', price: 2450, bedrooms: 4, beds: 8, bathrooms: 2, hasPool: false, avatar: 'beach', address: 'Malmö, Schweden', lat: 55.6050, lng: 13.0038 },
    { url: 'https://www.airbnb.de/rooms/beispiel-2', title: 'Strandvilla Seeblick', price: 3100, bedrooms: 5, beds: 9, bathrooms: 3, hasPool: true, avatar: 'villa', address: 'Sellin, Rügen' , lat: 54.3753, lng: 13.6957 },
    { url: 'https://www.fewo-direkt.de/ferienwohnung/beispiel-3', title: 'Kapitänshaus am Bodden', price: 1980, bedrooms: 3, beds: 7, bathrooms: 1, hasPool: false, avatar: 'boat', address: 'Gingst, Rügen' },
  ];
  const ids: string[] = [];
  for (const h of houses) {
    ids.push(await repos.properties.create(id, { ...h, provider: new URL(h.url).hostname.replace(/^www\./, '') }));
    const photo = housePhotos[h.url];
    if (photo) await repos.previews.seed(h.url, photo.title, null, photo.site, `/assets/demo-photos/${photo.photo}.jpg`);
  }
  await repos.votes.set(id, ids[0], 5);
  await repos.votes.set(id, ids[1], 3);
  await repos.votes.setFavorite(id, ids[0]);
  await repos.comments.add(id, ids[0], 'Sauna und Garten – perfekt für die Kinder!', 5);
  // Owner's home location (Hamburg, Germany) – used for "distance from home" on the map.
  await repos.kv.set('home_location', JSON.stringify({ lat: 53.5511, lng: 9.9937, label: 'Hamburg' }));
  return id;
}
