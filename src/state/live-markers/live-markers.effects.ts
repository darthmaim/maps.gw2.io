import {Injectable} from '@angular/core';
import {Actions} from '@ngrx/effects';

@Injectable()
export class LiveMarkersEffects {
  constructor(private actions$: Actions) {}
}
