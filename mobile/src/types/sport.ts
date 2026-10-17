// Per-sport scoring options. The backend stores these as data ("never hard-code event names"),
// so the UI renders whatever list it is given; it never switches on an event name.
export interface ScoringEventOption {
  id: string; // sent as payload.event_type
  label: string;
  hint?: string; // "1 point", "6 runs"
}

export interface SportConfig {
  sportId: string;
  name: string;
  scoringModel: 'event' | 'innings' | 'round';
  events: ScoringEventOption[];
}
