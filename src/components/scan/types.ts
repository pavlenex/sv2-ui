export type Sv2Status = 'sv2_native' | 'sv1_translated';

export interface ScanRow {
  ip: string;
  mac: string | null;
  make: string;
  model: string;
  manufacturer: string;
  firmware: string;
  firmware_version: string;
  serial_number: string | null;
  sv2_status: Sv2Status;
}

export type PairOutcome =
  | { kind: 'pending' }
  | { kind: 'success' }
  | { kind: 'auth_required' }
  | { kind: 'error'; message: string };
