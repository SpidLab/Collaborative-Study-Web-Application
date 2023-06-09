import { State } from "./state"
import { User } from "../types"

export type Action =
    {
        type: "SET_NOTIFICATION_MESSAGE",
        payload: { message: string, alertType: string }
    } |
    {
        type: "SET_USER",
        payload: User
    } |
    {
        type: "SET_PDA_TOKEN",
        payload: string
    } |
    {
        type: "SET_PDA_USERNAME",
        payload: string
    } |
    {
        type: "SET_METRIPORT_INFO",
        payload: { metriportId: string, metriportToken: string }
    }

export const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case "SET_NOTIFICATION_MESSAGE":
            return {
                ...state,
                notification: {
                    message: action.payload.message,
                    alertType: action.payload.alertType
                }
            }
        case "SET_USER":
            return {
                ...state,
                user: action.payload
            }
        case "SET_PDA_TOKEN":
            return {
                ...state,
                user: {
                    ...state.user,
                    pdaOwnerToken: action.payload
                }
            }
        case "SET_PDA_USERNAME":
            return {
                ...state,
                user: {
                    ...state.user,
                    pdaUsername: action.payload
                }
            }
        case "SET_METRIPORT_INFO":
            return {
                ...state,
                user: {
                    ...state.user,
                    metriportId: action.payload.metriportId,
                    metriportToken: action.payload.metriportToken
                }
            }
        default:
            return state
    }
}