/**
 * AMP Data Schema & Version Compatibility Governance Engine
 */

export const CURRENT_SCHEMA_VERSION = 1;
export const CURRENT_MIN_APP_VERSION = "0.16.0";
export const CURRENT_APP_VERSION = "0.16.3";

export interface DataMetaHeader {
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
}

export interface DataEnvelope<T> {
  _meta?: DataMetaHeader;
  AnnouncementsBackupCounter?: number;
  ShowsBackupCounter?: number;
  data: T;
}

export type CompatibilityStatus = 'COMPATIBLE' | 'OLDER_VERSION_DETECTED' | 'NEWER_VERSION_DETECTED';

export interface CompatibilityReport {
  status: CompatibilityStatus;
  schemaVersion: number;
  minAppVersion: string;
  lastModifiedBy: string;
  reason?: string;
}

/**
 * Clean comparison of SemVer versions (e.g., "0.16.3" vs "0.16.0")
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [maj1, min1, pat1] = parse(v1);
  const [maj2, min2, pat2] = parse(v2);

  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

/**
 * Creates a standard metadata envelope header for saved JSON stores
 */
export function createDataMetaHeader(): DataMetaHeader {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    minAppVersion: CURRENT_MIN_APP_VERSION,
    lastModifiedBy: CURRENT_APP_VERSION,
    lastModifiedAt: new Date().toISOString()
  };
}

/**
 * Evaluates compatibility of a loaded JSON payload against the current AMP executable
 */
export function assessDataCompatibility(meta?: Partial<DataMetaHeader> | null): CompatibilityReport {
  const schemaVersion = meta?.schemaVersion !== undefined ? meta.schemaVersion : 0;
  const minAppVersion = meta?.minAppVersion || "0.16.0";
  const lastModifiedBy = meta?.lastModifiedBy || "0.15.0";

  // Check 1: Forward Incompatibility (File was written by a newer version requiring newer minimum app)
  if (meta?.minAppVersion && compareSemver(meta.minAppVersion, CURRENT_APP_VERSION) > 0) {
    return {
      status: 'NEWER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data requires minimum AMP version v${minAppVersion}, but current application is v${CURRENT_APP_VERSION}.`
    };
  }

  // Check 2: Backward Incompatibility (File has legacy or older schema version)
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    return {
      status: 'OLDER_VERSION_DETECTED',
      schemaVersion,
      minAppVersion,
      lastModifiedBy,
      reason: `Data schema (v${schemaVersion}) is older than current AMP native schema (v${CURRENT_SCHEMA_VERSION}).`
    };
  }

  return {
    status: 'COMPATIBLE',
    schemaVersion,
    minAppVersion,
    lastModifiedBy
  };
}
