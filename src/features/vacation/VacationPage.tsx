import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonLabel,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  useIonRouter,
} from '@ionic/react';
import { add, calendarOutline, homeOutline, locationOutline, mapOutline, peopleOutline, personAddOutline } from 'ionicons/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { fmtDateRange, nights } from '../../core/format';
import { useLiveQuery } from '../../data/db/DbContext';
import { PROPERTY_TABLES } from '../../data/repositories/propertyRepo';
import { VACATION_TABLES } from '../../data/repositories/vacationRepo';
import type { PropertyWithStats } from '../../domain/models';
import { haversineKm } from '../../domain/services/geo';
import { rankProperties, sortProperties, type SortKey } from '../../domain/services/ranking';
import { matchesSearch } from '../../domain/services/search';
import { useSharing } from '../sharing/useSharing';
import { VacationEditModal } from '../vacations/VacationEditModal';
import { MapView } from './MapView';
import { PeopleSection } from './PeopleSection';
import { PropertyCard } from './PropertyCard';
import { PropertyEditModal } from './PropertyEditModal';
import './vacation.css';

type Tab = 'houses' | 'map' | 'people';

/** One vacation: the ranked houses, the map, the people. */
export function VacationPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { repos, home, session, account } = useApp();
  const router = useIonRouter();
  const sharing = useSharing();
  const [tab, setTab] = useState<Tab>('houses');
  const [sort, setSort] = useState<SortKey>('rank');
  const [adding, setAdding] = useState(false);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editingVacation, setEditingVacation] = useState(false);
  const [showEliminated, setShowEliminated] = useState(false);
  const [query, setQuery] = useState('');

  const { data: vacation } = useLiveQuery(() => repos.vacations.get(id), ['vacations'], [repos, id]);
  const { data: members } = useLiveQuery(() => repos.vacations.members(id), VACATION_TABLES, [repos, id]);
  const { data: houses } = useLiveQuery(() => repos.properties.listWithStats(id), PROPERTY_TABLES, [repos, id]);

  // Left / removed / deleted elsewhere: back to the list.
  useEffect(() => {
    if (vacation === null) router.push('/vacations', 'root');
  }, [vacation, router]);

  const iAmOwner = members?.some((m) => m.userId === session.userId && m.role === 'owner') ?? false;
  const people = members?.length ?? 1;
  const distance = (p: PropertyWithStats) => (home && p.lat !== null && p.lng !== null ? haversineKm(home, { lat: p.lat, lng: p.lng }) : null);

  const ranks = useMemo(() => {
    const m = new Map<string, number>();
    rankProperties(houses?.filter((h) => h.status === 'active') ?? []).forEach((h, i) => m.set(h.id, i + 1));
    return m;
  }, [houses]);
  const visible = useMemo(() => {
    const list = sortProperties((houses ?? []).filter((h) => matchesSearch(h, query)), sort, distance);
    const booked = list.filter((h) => h.status === 'booked');
    const active = list.filter((h) => h.status === 'active');
    const out = list.filter((h) => h.status === 'eliminated');
    return { main: [...booked, ...active], eliminated: out };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houses, sort, home, query]);
  const unrated = houses?.filter((h) => h.status === 'active' && h.myVote === null).length ?? 0;
  const located = houses?.filter((h) => h.lat !== null && h.lng !== null) ?? [];
  const propertyToEdit = houses?.find((h) => h.id === editingProperty) ?? null;

  if (!vacation) return <IonPage />;
  const n = nights(vacation.startDate, vacation.endDate);
  const openHouse = (pid: string) => router.push(`/vacations/${id}/houses/${pid}`);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/vacations" text="" />
          </IonButtons>
          <IonTitle>{vacation.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => sharing.createInvite(id, vacation.name)} aria-label={t('sharing.invite')}>
              <IonIcon slot="icon-only" icon={personAddOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="houses">
              <IonIcon icon={homeOutline} />
              <IonLabel>{t('vacation.tabs.houses')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="map">
              <IonIcon icon={mapOutline} />
              <IonLabel>{t('vacation.tabs.map')}</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="people">
              <IonIcon icon={peopleOutline} />
              <IonLabel>{t('vacation.tabs.people')}</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {account.online && tab !== 'map' && (
          <IonRefresher slot="fixed" onIonRefresh={(e) => void account.syncNow().then(() => e.detail.complete())}>
            <IonRefresherContent />
          </IonRefresher>
        )}

        {tab === 'houses' && (
          <>
            <div className="vacation-head">
              {vacation.destination && (
                <span>
                  <IonIcon icon={locationOutline} /> {vacation.destination}
                </span>
              )}
              {(vacation.startDate || vacation.endDate) && (
                <span>
                  <IonIcon icon={calendarOutline} /> {fmtDateRange(vacation.startDate, vacation.endDate)}
                  {n ? ` · ${t('vacation.nights', { count: n })}` : ''}
                </span>
              )}
              {vacation.description && <p className="pre-wrap">{vacation.description}</p>}
            </div>

            {(houses?.length ?? 0) > 2 && (
              <IonSearchbar
                className="house-search"
                value={query}
                placeholder={t('vacation.search')}
                debounce={150}
                onIonInput={(e) => setQuery(String(e.detail.value ?? ''))}
              />
            )}
            {!!houses?.length && (
              <div className="chip-row">
                {(['rank', 'price', 'newest', ...(home ? (['distance'] as const) : [])] as SortKey[]).map((k) => (
                  <IonChip key={k} color={sort === k ? 'primary' : undefined} outline={sort !== k} onClick={() => setSort(k)}>
                    {t(`sort.${k}`)}
                  </IonChip>
                ))}
              </div>
            )}
            {query.trim() && visible.main.length + visible.eliminated.length === 0 && <p className="todo-note">{t('vacation.noMatch')}</p>}
            {unrated > 0 && !query.trim() && <p className="todo-note">{t('vacation.unrated', { count: unrated })}</p>}

            {houses && houses.length === 0 && (
              <div className="empty-state">
                <IonIcon icon={homeOutline} />
                <h2>{t('vacation.emptyTitle')}</h2>
                <p>{t('vacation.emptyText')}</p>
                <IonButton onClick={() => setAdding(true)}>
                  <IonIcon slot="start" icon={add} />
                  {t('property.add')}
                </IonButton>
                {people < 2 && (
                  <IonButton fill="clear" onClick={() => sharing.createInvite(id, vacation.name)}>
                    <IonIcon slot="start" icon={personAddOutline} />
                    {t('sharing.invite')}
                  </IonButton>
                )}
              </div>
            )}

            <div className="property-list">
              {visible.main.map((p) => (
                <PropertyCard
                  key={p.id}
                  p={p}
                  rank={sort === 'rank' ? (ranks.get(p.id) ?? null) : null}
                  people={people}
                  settings={vacation.settings}
                  distanceKm={distance(p)}
                  onOpen={() => openHouse(p.id)}
                  onEdit={() => setEditingProperty(p.id)}
                />
              ))}
              {visible.eliminated.length > 0 && (
                <IonButton fill="clear" expand="block" onClick={() => setShowEliminated((s) => !s)}>
                  {showEliminated ? t('vacation.hideEliminated') : t('vacation.showEliminated', { count: visible.eliminated.length })}
                </IonButton>
              )}
              {showEliminated &&
                visible.eliminated.map((p) => (
                  <PropertyCard key={p.id} p={p} rank={null} people={people} settings={vacation.settings} distanceKm={distance(p)} onOpen={() => openHouse(p.id)} onEdit={() => setEditingProperty(p.id)} />
                ))}
            </div>
          </>
        )}

        {tab === 'map' && (
          <div className="map-tab">
            <MapView houses={located} home={home} onOpen={openHouse} />
            {located.length === 0 && <p className="map-hint">{t('map.empty')}</p>}
          </div>
        )}

        {tab === 'people' && members && (
          <PeopleSection
            vacation={vacation}
            members={members}
            iAmOwner={iAmOwner}
            onInvite={() => sharing.createInvite(id, vacation.name)}
            onEdit={() => setEditingVacation(true)}
          />
        )}

        {tab === 'houses' && !!houses?.length && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton onClick={() => setAdding(true)} aria-label={t('property.add')}>
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
      </IonContent>

      <PropertyEditModal isOpen={adding || editingProperty !== null} vacationId={id} settings={vacation.settings} property={propertyToEdit} onClose={() => { setAdding(false); setEditingProperty(null); }} />
      <VacationEditModal
        isOpen={editingVacation}
        initial={vacation}
        onClose={() => setEditingVacation(false)}
        onSave={(input) => repos.vacations.update(id, input)}
      />
      {sharing.ui}
    </IonPage>
  );
}
