import { BehaviorSubject } from 'rxjs';

export function entityOrDefault(configEntity: any, defaultValue: any) {
  return configEntity !== undefined ? configEntity : defaultValue;
}

export function nextIfChanged(behaviorSubject: BehaviorSubject<any>, latestValue: any): void {
  latestValue !== undefined && behaviorSubject.value !== latestValue ? behaviorSubject.next(latestValue) : null;
}
