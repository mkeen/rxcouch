import { BehaviorSubject, Subscription } from 'rxjs';
import { HttpRequestHeaders } from '@mkeen/rxhttp';

// Internal configuration
export type WatcherConfig = [
  string[],              // 0
  string,                // 1
  string,                // 2
  number,                // 3
  boolean,               // 4
  string | null,         // 5
  boolean,               // 6
  boolean                // 7
];

export type CouchDBDocument = {
  _id: string;
  _rev: string;
} & {
  [prop: string]: any;
}

export type CouchDBPreDocument = {
} & {
  [prop: string]: any;
}

export type CouchDBDocumentIndex = {
} & {
  [prop: string]: BehaviorSubject<CouchDBDocument>;
}

export type CouchDBHashIndex = {
} & {
  [prop: string]: String;
}

export type CouchDBAppChangesSubscriptions = {
} & {
  [prop: string]: Subscription;
}

export type CouchDBFindSelector = {
} & {
  [prop: string]: any;
}

export type CouchDBFindSort = {
  [prop: string]: string;
}

export type CouchDBDesignView = 'view';
export type CouchDBDesignList = 'list';

export type CouchDBAuthentication = (username: string, password: string) => void;

export interface CouchDBBasicResponse {
  ok: boolean;
}

export interface CouchDBChange {
  rev: string;
}

export interface RxCouchConfig {
  dbName: string;
  host?: string;
  port?: number;
  ssl?: boolean;
  cookie?: string | null;
  trackChanges?: boolean;
}

export interface CouchDBChanges { // Refactor: rename to CouchDBChange
  id: string;
  doc: CouchDBDocument;
  changes: CouchDBChange[];
  last_seq?: string;
  seq?: string;
  deleted?: boolean;
}

export interface CouchDBChangeFeed {           
  last_seq: string;
  pending: number;
  results: CouchDBChanges[]; // CouchDBChange[] ^^^^
}

export interface CouchDBDocumentRevisionResponse {
  id: string;
  rev: string;
  error?: string;
  ok?: boolean;
  reason?: string;
}

export interface CouchDBError {
  error: string;
  reason: string;
}

export interface CouchDBHeaders extends HttpRequestHeaders {
  Cookie?: any;
}

export interface CouchDBDesignViewResponse {
  total_rows: number;
  offset: number;
  rows: CouchDBDocument[];
}

export interface CouchDBDesignViewOptions {
  attachments?: boolean;
  conflicts?: boolean;
  descending?: boolean;
  endkey?: any;
  endkey_docid?: string;
  group?: boolean;
  group_level?: number;
  include_docs?: boolean;
  att_encoding_info?: boolean;
  inclusive_end?: boolean;
  key?: any;
  keys?: any;
  limit?: number;
  reduce?: boolean;
  skip?: number;
  sorted?: boolean;
  stable?: boolean;
  stale?: boolean;
  startkey?: any;
  startkey_docid?: any;
  update?: string;
  update_seq?: boolean;
}

export interface CouchDBAuthenticationResponse {
  ok: boolean;
  name: string;
  roles: string[];
}

export interface CouchDBSessionInfo {
  authenticated: string;
  authentication_db: string;
  authentication_handler: string[];
}

export interface CouchDBUserContext {
  name: string;
  roles: string[];
}

export interface CouchDBSession {
  ok: boolean;
  info: CouchDBSessionInfo;
  userCtx: CouchDBUserContext;
}

export enum AuthorizationBehavior {
  cookie = 'cookie',
  open = 'open'
}

export interface CouchDBCredentials {
  username: string;
  password: string;
}

export interface CouchDBFindQuery {
  selector?: CouchDBFindSelector;
  limit?: number;
  skip?: number;
  sort?: CouchDBFindSort[];
  fields?: string[];
  use_index?: string | [];
  r?: number;
  bookmark?: string;
  update?: boolean;
  stable?: boolean;
  stale?: string;
  execution_stats?: boolean;
}

export interface CouchDBFindResponse {
  docs: CouchDBDocument[];
  warning: string;
  execution_states: object;
  bookmark: string;
}

export interface CouchDBDeleteResponse {
  id: string;
  ok: boolean;
  rev: string;
}
