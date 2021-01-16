import { Observer, Observable, BehaviorSubject } from 'rxjs';
import { take, map, tap } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpResponseWithHeaders,
} from '@mkeen/rxhttp';

import {
  CouchDBAuthenticationResponse,
  AuthorizationBehavior,
  CouchDBCredentials,
  CouchDBSessionInfo,
  CouchDBBasicResponse,
  CouchDBUserContext,
} from './types';

export class CouchDBSession {
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public loginAttemptMade: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public userSession: BehaviorSubject<CouchDBSessionInfo | null> = new BehaviorSubject<CouchDBSessionInfo | null>(null);
  public cookie: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public context: BehaviorSubject<CouchDBUserContext | null> = new BehaviorSubject<CouchDBUserContext | null>(null);

  private lastCredentials: CouchDBCredentials | undefined;

  constructor(
    public authorizationBehavior: AuthorizationBehavior,
    public sessionUrl: string = '',
    private credentials?: Observable<CouchDBCredentials>,
  ) {
    if (this.credentials) {
      this.credentials.subscribe((couchDbCreds: CouchDBCredentials) => {
        this.authenticate(couchDbCreds).pipe(take(1)).subscribe((_) => { });
      });

    }

  }
  
  public authenticate(providedCredentials?: CouchDBCredentials): Observable<boolean> {
    return Observable.create((observer: Observer<boolean>) => {
      if ([AuthorizationBehavior.cookie, AuthorizationBehavior.jwt].includes(this.authorizationBehavior)) {
        if (providedCredentials) {
          this.lastCredentials = providedCredentials;
          this.attemptNewAuthentication(providedCredentials).pipe(take(1)).subscribe(
            (authResponse: CouchDBAuthenticationResponse) => {
              if(!this.loginAttemptMade.value) {
                this.loginAttemptMade.next(true);
              }

              if (this.authenticated.value !== true) {
                this.authenticated.next(true);
              }

              this.context.next(<CouchDBUserContext>authResponse);
              observer.next(true);
            },

            (_error) => {
              if(!this.loginAttemptMade.value) {
                this.loginAttemptMade.next(true);
              }
              
              this.authenticated.next(false);
              
              console.warn(_error);
              this.context.next(null);
              observer.error(false);
              observer.complete();
            }

          );

        } else {
          if (this.loginAttemptMade.value === false) {
            this.get().pipe(take(1)).subscribe(
              (session: CouchDBSessionInfo) => {
                const { ok, userCtx } = session;
                const authenticated = !!userCtx.name;

                if (this.authenticated.value !== authenticated) {
                  this.authenticated.next(authenticated);
                  if (ok) {
                    this.context.next(session.userCtx);
                    observer.next(true);
                  } else {
                    this.context.next(null);
                    observer.error(false);
                  }

                } else {
                  this.context.next(null);
                  observer.error(false);
                }

              }

            );

          } else {
            this.context.next(null);
            observer.error(false);
          }

        }

      }

    });

  }

  public reauthenticate(): Observable<boolean> {
    return this.authenticate(this.lastCredentials);
  }

  public get(): Observable<CouchDBSessionInfo> {
    return Observable.create((observer: Observer<CouchDBSessionInfo>) => {
      this.httpRequest<HttpResponseWithHeaders<CouchDBSessionInfo>>(
        this.sessionUrl,
        FetchBehavior.simpleWithHeaders
      ).fetch().pipe(
        tap(this.saveCookie),
        map(this.extractResponse)
      ).subscribe(
        (response: CouchDBSessionInfo) => {
          if(!this.loginAttemptMade.value) {
            this.loginAttemptMade.next(true);
          }

          if (response.ok && response.info.authenticated) {
            this.context.next(response.userCtx);

            if (!this.authenticated.value) {
              this.authenticated.next(true);
            }

          } else {
            this.context.next(null);

            if (!!this.authenticated.value) {
              this.authenticated.next(false);
            }

          }

          observer.next(response);
        },

        (err: any) => {
          observer.error(err);
        },

        // () => { this.loginAttemptMade.next(true); } // todo see if this could replace above call.
        // not sure that this would actually work or not. If not, should be easy to add to rxhttp
      );

    });

  }
  
  saveCookie = (access_token?) => {
    return (httpResponse: HttpResponseWithHeaders<any>) => {
      const { response, headers } = httpResponse;
      if (response.ok) {
        if (access_token) {
          this.cookie.next(access_token)
        } else if (typeof process === 'object') {
          const cookie = headers.get('set-cookie');
          if (cookie) {
            this.cookie.next(cookie);
          }
          
        }
        
      }
      
    }
    
  }

  extractResponse = (httpResponse: HttpResponseWithHeaders<any>) => {
    return httpResponse.response;
  }

  private attemptNewAuthentication(
    credentials: CouchDBCredentials
  ): Observable<CouchDBAuthenticationResponse> {
    return this.httpRequest<HttpResponseWithHeaders<CouchDBAuthenticationResponse>>(
      this.sessionUrl,
      FetchBehavior.simpleWithHeaders,
      'POST',
      JSON.stringify(!credentials.access_token ? { name: credentials.name, password: credentials.password } : undefined),
      credentials.access_token ? { Authorization: `Bearer ${credentials.access_token}` } : undefined
    ).fetch().pipe(
      tap(this.saveCookie(credentials.access_token)),
      map(this.extractResponse),
      tap((_response) => {
        this.loginAttemptMade.next(true);
      })

    );

  }

  private httpRequest<T>(
    url: string,
    behavior: FetchBehavior = FetchBehavior.simpleWithHeaders,
    method: string = 'GET',
    body: any = undefined,
    headers: any = undefined,
  ): HttpRequest<T> {
    return new HttpRequest<T>(
      url,
      this.httpRequestOptions(this.cookie?.value, method, body, headers),
      behavior
    );

  }

  private httpRequestOptions(cookie: string | null, method: string, body: string, headers?: string[][]): RequestInit {
    let httpOptions: RequestInit = {
      method
    }

    if (body) {
      httpOptions.body = body;
    }
    
    if (headers && headers.length) {
      httpOptions.headers = headers;
    }

    if (cookie !== null) {
      if (cookie.length && typeof process === 'object') { // Todo: Type hint and length check really necessary?
        httpOptions['headers'] = {
          'Cookie': this.cookieForRequestHeader(cookie) // Todo: Why is type hint needed when inside the null check?
        }

      }

    }

    return httpOptions;
  }

  private cookieForRequestHeader(cookie: string): string {
    return cookie.split(';')[0].trim();
  }

  public destroy() {
    return Observable.create((observer: Observer<CouchDBBasicResponse>) => {
      this.httpRequest<CouchDBBasicResponse>(
        this.sessionUrl,
        FetchBehavior.simple,
        'delete'
      ).fetch().subscribe((response: CouchDBBasicResponse) => {
        if (response.ok) {
          this.authenticated.next(false);
          this.cookie.next('');
        }

        observer.next(response);
      });

    });

  }

}
