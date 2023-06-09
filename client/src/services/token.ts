let token: string | null

const setToken = (tokenToSet: string) => {
    token = `bearer ${tokenToSet}`
}

export default setToken