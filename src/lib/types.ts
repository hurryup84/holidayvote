export type ParticipantRole = "owner" | "member";
export type PropertyStatus = "active" | "eliminated" | "booked";

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface Vacation {
  id: string;
  name: string;
  description: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  invite_code: string;
  owner_id: string;
  created_at: string;
}

export interface VacationPublic {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  invite_code: string;
  property_count: number;
  participant_count: number;
  vote_count: number;
  top_image_url: string | null;
}

export interface Participant {
  vacation_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
  profile?: Profile;
}

export interface Property {
  id: string;
  vacation_id: string;
  url: string;
  title: string | null;
  image_url: string | null;
  description: string | null;
  provider: string | null;
  price: number | null;
  beds: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  has_pool: boolean;
  status: PropertyStatus;
  suggested_by: string | null;
  created_at: string;
  updated_at: string;
  suggester?: Profile;
  votes?: Vote[];
  vetoes?: Veto[];
  comments?: Comment[];
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Vote {
  property_id: string;
  user_id: string;
  stars: number;
  created_at: string;
  profile?: Profile;
}

export interface Veto {
  property_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
}

export interface Comment {
  id: string;
  property_id: string;
  user_id: string;
  text: string;
  stars: number | null;
  created_at: string;
  profile?: Profile;
}

export interface PropertyStats {
  totalStars: number;
  voteCount: number;
  vetoCount: number;
  averageStars: number;
  userVote: number | null;
  userVeto: boolean;
  userVetoPropertyId: string | null;
}

export interface OpenGraphData {
  title: string | null;
  description: string | null;
  image: string | null;
  provider: string | null;
}
