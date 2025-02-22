import {createFeature, createReducer, createSelector, on} from '@ngrx/store';
import {AccountInfo} from "../../services/account.service";
import {userActions} from "./user.action";
import {Guild} from "../../services/guild.service";
import {AppState} from "../appState";
import {MatchOverview} from "../../services/wvw.service";

export interface UserState extends AccountInfo {
  error: string
  guild_details: { [guildId: string]: Guild }
  match_details: MatchOverview | undefined
}

const initialState: UserState = {
  error: "",
  guild_details: {},
  match_details: undefined,

  access: [],
  age: 0,
  commander: false,
  created: undefined,
  daily_ap: 0,
  fractal_level: 0,
  guild_leader: [],
  guilds: [],
  id: "",
  monthly_ap: 0,
  name: "",
  world: "0",
  wvw_rank: 0
};

export const userFeature = createFeature({
  name: 'user',
  reducer: createReducer(
    initialState,
    on(userActions.setUserData, (state, props) => {
      return {
        ...state,
        ...props.accountInfo
      };
    }),
    on(userActions.setUserDataError, (state, props) => {
      return {
        ...state,
        error: props.error
      }
    }),
    on(userActions.addUserGuild, (state, props) => {
      const guilds = {...state.guild_details}
      guilds[props.guild.id] = props.guild;

      return {
        ...state,
        guild_details: guilds
      }
    }),
    on(userActions.addUserGuildError, (state, props) => {
      const guilds = {...state.guild_details}
      guilds[props.id] = {
        name: props.id,
        id: props.id,
        tag: "[Unknown]"
      };

      return {
        ...state,
        guild_details: guilds
      }
    }),
    on(userActions.addWvWMatchOverview, (state, props) => {
      return {
        ...state,
        match_details: props.matchDetails
      }
    })
  )
});

export const selectUserRegion = createSelector(
  (state: AppState) => state.user.world,
  (worldId) => {
    return parseInt(worldId) >= 2000 ? "eu" : "us";
  }
);

export const selectUserAccountName = createSelector(
  (state: AppState) => state.user.name,
  (name) => name
);

export const selectUserWvwTeam = createSelector(
  (state: AppState) => state.user.match_details,
  (state: AppState) => state.user.world,
  (matchDetails, worldId) => {
    if (matchDetails) {
      return {
        team: matchDetails.all_worlds.red.includes(worldId) ?
          "red" :
          matchDetails.all_worlds.green.includes(worldId) ?
            "green" :
            "blue",
        matchId: matchDetails.id
      }
    }
    return undefined;
  }
);

export const {
  name, // feature name
} = userFeature;
