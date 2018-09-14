import { WatcherConfig } from './types';

export namespace CouchUrls {
  export function design(
    config: WatcherConfig,
    designName: string,
    designTypeName: string,
    designType: string = 'view',
    options?: any
  ): string {
    let base = `${prefix(config)}/_design/${designName}/_${designType}/${designTypeName}`;
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
    let url = `${prefix(config)}`;
    if (docId) {
      url += `/${docId}`;
    }

    return url;
  }

  export function prefix(config: WatcherConfig): string {
    return `http://${config[2]}:${config[3]}/${config[1]}`
  }

  export function watch(config: WatcherConfig): string {
    return `${prefix(config)}/_changes?include_docs=true&feed=continuous&filter=_doc_ids&since=now`;
  }

}
