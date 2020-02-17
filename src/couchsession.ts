import { Observer, Observable, BehaviorSubject } from 'rxjs';
import { take, map, tap } from 'rxjs/operators';

import {
  FetchBehavior,
  HttpRequest,
  HttpRequestOptions,
  HttpResponseWithHeaders,
} from '@mkeen/rxhttp';

import {
  CouchDBAuthenticationResponse,
  AuthorizationBehavior,
  CouchDBCredentials,
  CouchDBSession,
  CouchDBBasicResponse,
  CouchDBUserContext,
} from './types';


export class CouchSession {
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public loginAttemptMade: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public userSession: BehaviorSubject<CouchDBSession | null> = new BehaviorSubject<CouchDBSession | null>(null);
  public cookie: BehaviorSubject<string> = new BehaviorSubject<string>('');
  public context: BehaviorSubject<CouchDBUserContext | null> = new BehaviorSubject<CouchDBUserContext | null>(null);

  constructor(
    public authorizationBehavior: AuthorizationBehavior,
    public sessionUrl: string = '',
    private credentials?: Observable<CouchDBCredentials>,
  ) {
    if(!!this.credentials) {
      this.credentials.subscribe((couchDbCreds: CouchDBCredentials) => {
        this.authenticate(couchDbCreds).pipe(take(1)).subscribe((_authSuccess) => {
          this.authenticated.next(this.authenticated.value);
        },

        (_error) => {
          if (!!this.authenticated.value) {
            this.authenticated.next(false);
          }

        });

      });

    }

  }

  public authenticate(providedCredentials?: CouchDBCredentials): Observable<boolean> {
    return Observable.create((observer: Observer<boolean>) => {
      if (this.authorizationBehavior === AuthorizationBehavior.cookie) {
        if (providedCredentials) {
          const { username, password } = providedCredentials;
          this.attemptNewAuthentication(username, password).pipe(take(1)).subscribe(
            (authResponse: CouchDBAuthenticationResponse) => {
              if (this.authenticated.value !== true) {
                this.authenticated.next(true);
              }

              delete authResponse.ok;
              this.context.next(<CouchDBUserContext>authResponse);

              observer.next(true);
            },

            (_error) => {
              console.warn(_error);
              this.context.next(null);
              observer.error(false);
              observer.complete();
            }

          );

        } else {
          if (this.loginAttemptMade.value === false) {
            this.loginAttemptMade.next(true);
            this.get().pipe(take(1)).subscribe(
              (session: CouchDBSession) => {
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

  public get(): Observable<CouchDBSession> {
    return Observable.create((observer: Observer<CouchDBSession>) => {
      this.httpRequest<HttpResponseWithHeaders<CouchDBSession>>(
        this.sessionUrl,
        FetchBehavior.simpleWithHeaders
      ).fetch().pipe(
        tap(this.saveCookie),
        map(this.extractResponse)
      ).subscribe(
        (response: CouchDBSession) => {
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
        // not sure that this would actuallt work or not. If not, should be easy to add to rxhttp
      );

    });

  }

  saveCookie = (httpResponse: HttpResponseWithHeaders<any>) => {
    const { headers } = httpResponse;
    if (typeof process === 'object') {
      const cookie = headers.get('set-cookie');
      if (cookie) {
        this.cookie.next(cookie);
      }

    }
  }

  extractResponse = (httpResponse: HttpResponseWithHeaders<any>) => {
    return httpResponse.response;
  }

  private attemptNewAuthentication(
    username: string,
    password: string
  ): Observable<CouchDBAuthenticationResponse> {
    return this.httpRequest<HttpResponseWithHeaders<CouchDBAuthenticationResponse>>(
      this.sessionUrl,
      FetchBehavior.simpleWithHeaders,
      'POST',
      JSON.stringify({
        'username': username,
        'password': password
      })

    ).fetch().pipe(
      tap(this.saveCookie),
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
  ): HttpRequest<T> {
    return new HttpRequest<T>(
      url,
      this.httpRequestOptions(this.cookie?.value, method, body),
      behavior
    );

  }

  private httpRequestOptions(cookie: string | null, method: string, body: string): HttpRequestOptions {
    let httpOptions: HttpRequestOptions = {
      method
    }

    if (body) {
      httpOptions.body = body;
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
