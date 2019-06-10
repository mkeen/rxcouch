import { WatcherConfig } from './types';

import {
  IDS,
  DATABASE_NAME,
  HOST,
  PORT,
  SSL,
  COOKIE
} from './enums';

export namespace CouchUrls {
  export function design(
    config: WatcherConfig,
    designName: string,
    designTypeName: string,
    designType: string = 'view',
    options?: any,
  ): string {
    let base = `${prefix(config)}/${config[DATABASE_NAME]}/_design/${designName}/_${designType}/${designTypeName}`;
    if (options) {
      base += '?'
      for (let name in options) {
        if (options.hasOwnProperty(name)) {
          base += `${name}=${options[name]}&`
        }

      }

      base = base.substring(0, base.length - 1);
    }

    return base;
  }

  export function document(config: WatcherConfig, docId?: string): string {
    let url = `${prefix(config)}/${config[DATABASE_NAME]}`;
    if (docId) {
      url += `/${docId}`;
    }

    return url;
  }

  export function prefix(config: WatcherConfig): string {
    return `${config[SSL] ? 'https' : 'http'}://${config[HOST]}:${config[PORT]}`
  }

  export function watch(config: WatcherConfig): string {
    return `${prefix(config)}/${config[DATABASE_NAME]}/_changes?include_docs=true&feed=continuous&filter=_doc_ids&since=now`;
  }

  export function authenticate(config: WatcherConfig) {
    return `${prefix(config)}/_session`;
  }

}
