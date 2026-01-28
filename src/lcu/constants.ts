// LCU 常量定义

export enum EventCode {
    WELCOME = 0,
    PREFIX = 1,
    CALL = 2,
    CALLRESULT = 3,
    CALLERROR = 4,
    SUBSCRIBE = 5,
    UNSUBSCRIBE = 6,
    PUBLISH = 7,
    EVENT = 8,
}

export enum ConnectionState {
    DISCONNECTED = 'disconnected',
    WAITING_FOR_CLIENT = 'waiting_for_client',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
}

export const LCUEvents = {
    ALL_JSON_API: 'OnJsonApiEvent',
    GAMEFLOW: 'OnJsonApiEvent_lol-gameflow_v1_gameflow-phase',
    CHAMP_SELECT: 'OnJsonApiEvent_lol-champ-select_v1_session',
    LOBBY: 'OnJsonApiEvent_lol-lobby_v2_lobby',
    MATCHMAKING: 'OnJsonApiEvent_lol-matchmaking_v1_search',
    CURRENT_SUMMONER: 'OnJsonApiEvent_lol-summoner_v1_current-summoner',
} as const;
