export interface CouchDBChange {
  rev: string;
}

export interface CouchDBChanges {
  changes: CouchDBChange[];
  id: string;
  seq: string;
  doc: CouchDBDocument;
}

export interface CouchDBDocument {
  "_id": string;
}

export interface CouchDBDesignView {
  total_rows: number;
  offset: number;
  rows: CouchDBDocument[];
}
