import { BehaviorSubject, Subscription } from 'rxjs';
import { HttpRequestHeaders } from '@mkeen/rxhttp/dist/types';

export type WatcherConfig = [string[], string, string, CouchDBHeaders, number];

export type CouchDBDocument = {
  _id: string;
} & {
  [prop: string]: any;
}

export type CouchDBPreDocument = {
} & {
  [prop: string]: any;
}

export type CouchDBDocumentIndex = {} & {
  [prop: string]: BehaviorSubject<CouchDBDocument>;
}

export type CouchDBHashIndex = {} & {
  [prop: string]: String;
}

export type CouchDBAppChangesSubscriptions = {} & {
  [prop: string]: Subscription;
}

export type CouchDBDesignView = 'view';
export type CouchDBDesignList = 'list';

export interface CouchDBChange {
  rev: string;
}

export interface CouchDBChanges {
  changes: CouchDBChange[];
  id: string;
  seq?: string;
  last_seq?: string;
  doc: CouchDBDocument;
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
  conflicts?: boolean;
  descending?: boolean;
  endkey?: any;
  endkey_docid?: string;
  group?: boolean;
  group_level?: number;
  include_docs?: boolean;
  attachments?: boolean;
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
