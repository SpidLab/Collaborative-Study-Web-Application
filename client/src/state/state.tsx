import React, { createContext, useContext, useReducer } from "react"
import { User } from "../types"

import { Action } from "./reducer"

export type State = {
    user: User,
    // pda_token: string,
    // pda_username: string
    notification: {
        message: string,
        alertType: string
    }
}

const initialState: State = {
    user: {} as User,
    // pda_token: '',
    // pda_username: '',
    notification: {
        message: '',
        alertType: 'none'
    }
}

export const StateContext = createContext<[State, React.Dispatch<Action>]>([
    initialState,
    () => initialState
])

type StateProviderProps = {
    reducer: React.Reducer<State, Action>;
    children: React.ReactElement;
}

export const StateProvider = ({
    reducer,
    children
}: StateProviderProps) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    return (
        <StateContext.Provider value={[state, dispatch]}>
            {children}
        </StateContext.Provider>
    )
}

export const useStateValue = () => useContext(StateContext);