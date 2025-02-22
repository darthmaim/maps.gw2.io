import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {liveMarkersActions} from "./live-markers.action";
import {AppState} from "../appState";
import {selectUserAccountName, selectUserRegion, selectUserWvwTeam} from "../user/user.feature";
import {ChannelType} from "../settings/settings.feature";
import {PointTuple} from "leaflet";

export interface LiveMarkersState {
  authToken: string;
  activeContinentId: 1 | 2;
}

const initialState: LiveMarkersState = {
  authToken: "",
  activeContinentId: 1,
};

export const liveMarkersFeature = createFeature({
  name: 'liveMarkers',
  reducer: createReducer(
    initialState,
    on(liveMarkersActions.setAuthToken, (state, props) => {
      return {
        ...state,
        authToken: props.authToken
      }
    }),
    on(liveMarkersActions.clearAuthToken, (state) => {
      return {
        ...state,
        authToken: ""
      }
    }),
    on(liveMarkersActions.setActiveContinent, (state, props) => {
      return {
        ...state,
        activeContinentId: props.continentId
      }
    })
  ),
});

export const selectUserWithAuthToken = createSelector(
  (state: AppState) => state.user.name,
  (state: AppState) => state.liveMarkers.authToken,
  (user, authToken) => {
    return {user, authToken};
  }
);

export const selectUserTopic = createSelector(
  (state: AppState) => state.settings,
  (state: AppState) => state.liveMarkers.activeContinentId,
  selectUserRegion,
  selectUserWvwTeam,
  selectUserAccountName,
  (settings, continentId, region, teamDetails, accountName) => {
    if (teamDetails === undefined) {
      return undefined;
    }

    switch(settings.selectedChannel) {
      case ChannelType.Global:
        return continentId === 1 ?
          `maps.gw2.io/global/${continentId}/${region}/#` :
          `maps.gw2.io/global/${continentId}/${teamDetails.matchId}/${teamDetails.team}/#`
      case ChannelType.Guild:
        return `maps.gw2.io/guild/${settings.guildChannel}/#`
      case ChannelType.Custom:
        return `maps.gw2.io/custom/${settings.customChannel}/#`
      case ChannelType.Solo:
        return `maps.gw2.io/solo/${accountName}/#`
      default:
        return undefined;
    }
  }
);

export const selectLiveMapEnabled = createSelector(
  (state: AppState) => state.settings.liveMapEnabled,
  (enabled) => enabled
);

export const {
  name, // feature name
} = liveMarkersFeature;

export interface LivePlayerData extends CharacterPositionUpdate, CharacterStateUpdate, CharacterMarkerInfo {}

export type MqttPayloadType = "UpsertCharacterMovement" | "UpdateCharacterState" | "DeleteCharacterData" | "UpdateCharacterKeepAlive";

export interface CharacterPositionUpdate {
  Type: MqttPayloadType;
  CharacterName: string;
  AccountName: string;
  ContinentId: number;
  MapId: number;
  MapPosition: Vector2;
  CharacterForward: Vector3;
}

export interface CharacterDeleteUpdate {
  Type: MqttPayloadType;
  CharacterName: string;
  AccountName: string;
}

export enum Mount {
  None,
  Jackal,
  Griffon,
  Springer,
  Skimmer,
  Raptor,
  RollerBeetle,
  Warclaw,
  Skyscale,
  Skiff,
  SiegeTurtle
}

export enum Profession {
  Unknown,
  Guardian,
  Warrior,
  Engineer,
  Ranger,
  Thief,
  Elementalist,
  Mesmer,
  Necromancer,
  Revenant
}

export interface CharacterStateUpdate {
  Type: MqttPayloadType;
  AccountName: string;
  CharacterName: string;
  ContinentId: number;
  MapId: number;
  ShardId: number;
  ServerConnectionInfo: string;
  BuildId: number;
  IsCommander: boolean;
  Mount: Mount;
  Profession: Profession;
  Specialisation: number;
}

export interface CharacterMarkerInfo {
  ReDraw: boolean | undefined;
  DeleteMarker: boolean | undefined;
  LastMessageTimestamp: number;
  Rotation: number;
  LatLng: PointTuple;
}

export interface Vector2 {
  X: number;
  Y: number;
}

export interface Vector3 {
  X: number;
  Y: number;
  Z: number;
}
