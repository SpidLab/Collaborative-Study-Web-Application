export interface User {
    metriportId?: string,
    progressiveEmployeeId?: string,
    metriportToken?: string,
    pdaUsername?: string,
    pdaOwnerToken?: string
}

// export interface PDAInfo {
//     pda_username?: string,
//     pda_email?: string,
//     pda_token?: string,
// }

export interface NewUser {
    name: string,
    progressiveEmployeeId: string,
    password: string
}