import { BehaviorSubject } from 'rxjs';
import { CouchDBDocument } from './types';
import * as _ from "lodash";

export class CouchDBBatch {
  public ids: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
}
